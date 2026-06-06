import fs from 'node:fs';
import path from 'node:path';
import { installSchedule, removeSchedule, scheduleStatus, type ScheduleStatus } from './scheduler.js';
import { GARDEN_STALE_DAYS, GARDEN_REMOVE_DAYS, GARDEN_ON_CALENDAR } from './config.js';
import type { Channel } from './types.js';

/**
 * Channel Skill gardening (issue #11, ADR-0006).
 *
 * Each Channel gets an edupudi-RESERVED weekly `edupudi-garden-<channelId>` systemd user timer,
 * installed + enabled at Channel creation and kept strictly separate from the user-schedule unit
 * (issue #5, `edupudi-<channelId>`). The timer fires a headless `claude -p` Garden pass in the
 * Channel dir that:
 *   - aggregates `.claude/skill-usage.jsonl` to per-skill last-used + counts, then compacts it;
 *   - compares against `.claude/skills/` (ONLY those dirs are Channel Skills — built-ins are never
 *     touched, ADR-0006);
 *   - marks Stale (unused > W1), Quarantines unused by MOVING the dir to `.claude/skills-archive/`,
 *     restores wrongly-quarantined ones (moves back), Removes (deletes from the archive) skills
 *     quarantined + still unused beyond W2;
 *   - dedupes/merges near-duplicate skills and may propose/create skills for recurring patterns.
 *
 * Lifecycle is AI-DECIDED (ADR-0006): W1/W2 are guidance handed to the prompt, not hard cron
 * thresholds. The deterministic part lives here only as the prompt + the unit install; the moves,
 * deletes, and the final ledger compaction are performed by the Garden agent during its run.
 */

/** The edupudi-reserved gardening unit name — distinct from the user-schedule unit (issue #5). */
export function gardenUnitName(channel: Channel): string {
  return `edupudi-garden-${channel.id}`;
}

export interface GardenWindows {
  /** W1 (days): unused longer than this → Stale → Quarantine candidate. */
  staleDays: number;
  /** W2 (days): Quarantined + still unused this much longer → Remove. */
  removeDays: number;
}

export const DEFAULT_WINDOWS: GardenWindows = {
  staleDays: GARDEN_STALE_DAYS,
  removeDays: GARDEN_REMOVE_DAYS,
};

export interface SkillUsage {
  skill: string;
  /** Epoch ms of the most recent invocation. */
  lastUsed: number;
  /** Total invocations seen in the ledger. */
  count: number;
}

/**
 * Aggregate an append-only `.claude/skill-usage.jsonl` ledger (ADR-0005) to per-skill last-used +
 * counts. Tolerant of blank/garbled lines — the ledger is append-only and may be mid-write. This
 * is the read side the Garden hands to the AI; it does NOT mutate the ledger (compaction is the
 * Garden agent's job, after it has acted on the aggregate).
 */
export function aggregateLedger(ledgerPath: string): SkillUsage[] {
  let raw: string;
  try {
    raw = fs.readFileSync(ledgerPath, 'utf8');
  } catch {
    return []; // no ledger yet → nothing has been invoked
  }
  const bySkill = new Map<string, SkillUsage>();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: { skill?: unknown; ts?: unknown };
    try {
      entry = JSON.parse(trimmed) as { skill?: unknown; ts?: unknown };
    } catch {
      continue; // skip a torn/partial line rather than failing the whole pass
    }
    const skill = typeof entry.skill === 'string' ? entry.skill : null;
    const ts = typeof entry.ts === 'number' ? entry.ts : null;
    if (!skill || ts === null) continue;
    const prev = bySkill.get(skill);
    if (prev) {
      prev.count += 1;
      if (ts > prev.lastUsed) prev.lastUsed = ts;
    } else {
      bySkill.set(skill, { skill, lastUsed: ts, count: 1 });
    }
  }
  return [...bySkill.values()].sort((a, b) => b.lastUsed - a.lastUsed);
}

/**
 * Build the headless Garden prompt for a Channel. Handed to `claude -p`; the agent runs in the
 * Channel dir so it inherits the persona/memory/tools and can read the ledger + skill dirs itself.
 * W1/W2 are passed as guidance only (ADR-0006). The prompt is intentionally self-contained so the
 * unit's ExecStart needs no extra files.
 */
export function buildGardenPrompt(windows: GardenWindows = DEFAULT_WINDOWS): string {
  const { staleDays, removeDays } = windows;
  return [
    'You are the weekly Channel Skill Garden for this edupudi channel (ADR-0006). Maintain the',
    'lifecycle of THIS channel\'s Channel Skills — the skill directories under `.claude/skills/`',
    '(each is a directory containing a SKILL.md). NEVER touch built-in/bundled Claude Code skills:',
    'only directories under `.claude/skills/` (live) and `.claude/skills-archive/` (quarantined) are',
    'Channel Skills you may garden. The two staleness windows below are GUIDANCE — you make the',
    'final call; keep a rarely-but-genuinely-useful skill, or quarantine an obvious dead-end early.',
    '',
    `Staleness window W1 = ${staleDays} days (Active → Stale).`,
    `Removal window  W2 = ${removeDays} days (Quarantined + still unused → Removed).`,
    '',
    'Do the following, in order:',
    '1. AGGREGATE usage: read `.claude/skill-usage.jsonl` (append-only, one {skill,ts} per line, ts',
    '   is epoch ms). Compute per-skill last-used and invocation count. Lines may be torn — skip',
    '   any you cannot parse.',
    '2. MARK STALE: a skill under `.claude/skills/` with no invocation within W1 (or never invoked',
    '   and older than W1) is Stale — a quarantine candidate.',
    '3. QUARANTINE: move each Stale, unused skill directory from `.claude/skills/<name>` to',
    '   `.claude/skills-archive/<name>` (a plain `mv`). Moving it out of `.claude/skills/` disables',
    '   it so the agent stops seeing it, while keeping it restorable. Create',
    '   `.claude/skills-archive/` if it does not exist.',
    '4. RESTORE: if a skill in `.claude/skills-archive/` is clearly still wanted (recent usage, or',
    '   it was quarantined in error), move it back to `.claude/skills/<name>` so it is visible again.',
    '5. REMOVE: a skill that has been in `.claude/skills-archive/` and still unused beyond a further',
    '   W2 may be deleted from the archive (`rm -rf .claude/skills-archive/<name>`). This is the only',
    '   destructive step — be conservative.',
    '6. DEDUPE/MERGE near-duplicate skills under `.claude/skills/`, and you MAY propose/create new',
    '   skills capturing recurring patterns you observe in the ledger.',
    '7. COMPACT the ledger: after acting, rewrite `.claude/skill-usage.jsonl` so it holds at most one',
    '   compacted {skill,ts} line per skill (the latest ts), dropping entries for skills that no',
    '   longer exist in either `.claude/skills/` or `.claude/skills-archive/`. This bounds the',
    '   append-only ledger\'s growth.',
    '',
    'Built-in skills are recorded in the ledger but MUST never be quarantined or removed — they have',
    'no directory under `.claude/skills/`, so simply leave any ledger entry without a matching skill',
    'directory alone (other than dropping it during compaction). Operate only within this channel.',
  ].join('\n');
}

/**
 * Install + enable the edupudi-reserved weekly Garden timer for a Channel. Called at Channel
 * creation (and idempotent — reuses the stable `edupudi-garden-<id>` unit). Best-effort: if
 * systemd cannot enable it (e.g. dev box without a user bus), the unit files are still written and
 * the scheduler logs a warning, mirroring `installSchedule`.
 */
export function installGarden(
  channel: Channel,
  windows: GardenWindows = DEFAULT_WINDOWS,
  onCalendar: string = GARDEN_ON_CALENDAR,
): string {
  return installSchedule(channel, onCalendar, buildGardenPrompt(windows), gardenUnitName(channel));
}

/** Remove the Garden timer for a Channel (used when a Channel is torn down). */
export function removeGarden(channel: Channel): void {
  removeSchedule(channel, gardenUnitName(channel));
}

/** Report the Garden timer's systemd state, reusing the user-schedule status reader. */
export function gardenStatus(channel: Channel): ScheduleStatus {
  return scheduleStatus(channel, gardenUnitName(channel));
}

/**
 * Quarantine a Channel Skill: MOVE `.claude/skills/<name>` → `.claude/skills-archive/<name>`
 * (ADR-0006). Exposed so the server/tests can drive the lifecycle deterministically; the weekly
 * Garden agent performs the equivalent move itself. Returns false if the live skill dir is absent.
 * Refuses any `name` that escapes the skills dir (path traversal guard).
 */
export function quarantineSkill(channel: Channel, name: string): boolean {
  return moveSkill(channel, name, 'skills', 'skills-archive');
}

/** Restore a quarantined Channel Skill: MOVE it back so the agent sees it again (ADR-0006). */
export function restoreSkill(channel: Channel, name: string): boolean {
  return moveSkill(channel, name, 'skills-archive', 'skills');
}

/** Remove a quarantined Channel Skill: DELETE it from the archive (ADR-0006). Conservative caller. */
export function removeSkill(channel: Channel, name: string): boolean {
  const archived = safeSkillPath(channel, 'skills-archive', name);
  if (!fs.existsSync(archived)) return false;
  fs.rmSync(archived, { recursive: true, force: true });
  return true;
}

function moveSkill(
  channel: Channel,
  name: string,
  from: 'skills' | 'skills-archive',
  to: 'skills' | 'skills-archive',
): boolean {
  const src = safeSkillPath(channel, from, name);
  if (!fs.existsSync(src)) return false;
  const destDir = path.join(channel.dir, '.claude', to);
  fs.mkdirSync(destDir, { recursive: true });
  fs.renameSync(src, path.join(destDir, name));
  return true;
}

/** Resolve `.claude/<area>/<name>`, rejecting names that escape the area (no `/`, `..`, etc.). */
function safeSkillPath(channel: Channel, area: 'skills' | 'skills-archive', name: string): string {
  const base = path.join(channel.dir, '.claude', area);
  const resolved = path.resolve(base, name);
  const rel = path.relative(base, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`invalid skill name: ${name}`);
  }
  return resolved;
}
