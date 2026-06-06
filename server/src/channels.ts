import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { CHANNELS_ROOT, CLEANUP_PERIOD_DAYS } from './config.js';
import { createMainThread, getMainThread } from './threads.js';
import { installGarden } from './garden.js';
import type { Channel } from './types.js';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Absolute path to the compiled Skill-usage logger (sits beside this module in server/dist/).
// The PreToolUse hook runs `node <this>` outside our process, so the command must be absolute.
const SKILL_LOGGER_PATH = fileURLToPath(new URL('./skill-logger.js', import.meta.url));

export function listChannels(): Channel[] {
  return db.prepare('SELECT * FROM channels ORDER BY created_at').all() as Channel[];
}

export function getChannel(id: string): Channel | undefined {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Channel | undefined;
}

export interface CreateChannelInput {
  name: string;
  persona?: string;
  systemPrompt: string;
  mcp?: Record<string, unknown>;
}

/**
 * Stamp a fully-isolated channel: directory + CLAUDE.md (system prompt + skill-authoring guidance)
 * + .claude/settings.json (pins per-channel auto-memory + the Skill-usage hook) + the Channel Skill
 * subsystem (`.claude/skills/` + `.claude/skills-archive/`) + optional .mcp.json (tools), then
 * installs the edupudi-reserved weekly Garden timer (issue #11/ADR-0006) that prunes those skills.
 */
export function createChannel(input: CreateChannelInput): Channel {
  const id = slugify(input.name);
  if (!id) throw new Error('invalid channel name');
  if (getChannel(id)) throw new Error(`channel "${id}" already exists`);

  const dir = path.join(CHANNELS_ROOT, id);
  // NOTE: CHANNELS_ROOT must be outside any git repo — Claude Code keys auto-memory
  // off the git root, so sibling channels under one repo would share memory.
  const memDir = path.join(dir, '.memory');
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.mkdirSync(memDir, { recursive: true });

  // Channel Skill subsystem (ADR-0005/0006): the live `.claude/skills/` lets the agent author the
  // first skill without a session restart; `.claude/skills-archive/` is the Garden's quarantine
  // destination. Created empty at stamp time so both homes exist before any gardening runs.
  fs.mkdirSync(path.join(dir, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'skills-archive'), { recursive: true });

  // 1) system prompt = CLAUDE.md (auto-loaded every session, interactive or headless),
  //    plus a skill-authoring guidance block nudging inline Channel Skill creation (ADR-0006).
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    renderClaudeMd(input.name, input.persona ?? '', input.systemPrompt),
  );

  // 2) per-channel settings: pin auto-memory inside the channel dir for zero ambiguity, and
  //    raise cleanupPeriodDays so Parked Threads' transcripts outlive Claude's default 30-day
  //    auto-purge — our Thread rows must not outlive their transcripts (ADR-0004). Also wire a
  //    PreToolUse/Skill hook to the edupudi logger so every skill invocation is appended to this
  //    Channel's append-only usage ledger (ADR-0005).
  fs.writeFileSync(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify(
      {
        autoMemoryEnabled: true,
        autoMemoryDirectory: memDir,
        cleanupPeriodDays: CLEANUP_PERIOD_DAYS,
        hooks: {
          PreToolUse: [
            {
              matcher: 'Skill',
              hooks: [
                {
                  type: 'command',
                  command: `node ${JSON.stringify(SKILL_LOGGER_PATH)}`,
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  // 3) per-channel tools
  if (input.mcp) {
    fs.writeFileSync(
      path.join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: input.mcp }, null, 2),
    );
  }

  const channel: Channel = {
    id,
    name: input.name,
    persona: input.persona ?? '',
    dir,
    created_at: Date.now(),
  };
  db.prepare(
    'INSERT INTO channels (id, name, persona, dir, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(channel.id, channel.name, channel.persona, channel.dir, channel.created_at);

  // Every Channel has an undeletable default Thread titled `main`; opening a Channel lands on it.
  createMainThread(channel.id);

  // Install the edupudi-reserved weekly Channel Skill Garden timer (issue #11, ADR-0006):
  // `edupudi-garden-<id>`, distinct from the user-schedule unit (issue #5). It fires a headless
  // `claude -p` pass that gardens this Channel's skills (stale → quarantine → remove). Best-effort
  // like installSchedule — a dev box without a systemd user bus still gets the unit files written.
  installGarden(channel);

  return channel;
}

function renderClaudeMd(name: string, persona: string, systemPrompt: string): string {
  const head = persona ? `${persona}\n\n` : '';
  return `# ${name}\n\n${head}${systemPrompt}\n${SKILL_AUTHORING_GUIDANCE}`;
}

// Nudge the Channel's agent to capture recurring workflows as Channel Skills (ADR-0006). Appended
// to every Channel's CLAUDE.md so skills are authored autonomously, inline during use.
const SKILL_AUTHORING_GUIDANCE = `
## Authoring skills

When you notice a workflow you keep repeating in this channel — a genuinely recurring, reusable
sequence of steps — capture it as a skill under \`.claude/skills/\`. Each skill is a directory
containing a \`SKILL.md\`.

- Only create a skill for something genuinely recurring and reusable — not a one-off.
- Write a sharp, specific \`description\` so it triggers at the right moment and nothing else.
- Keep each skill focused on a single workflow; prefer several small skills over one sprawling one.

Skills you author here are scoped to this channel. Unused ones are periodically reviewed and may be
archived, so keep the set lean and current.
`;

/** Trivial startup backfill: ensure every pre-existing Channel has its `main` Thread. */
export function backfillMainThreads(): void {
  for (const c of listChannels()) {
    if (!getMainThread(c.id)) createMainThread(c.id);
  }
}
