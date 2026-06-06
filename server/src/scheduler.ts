import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CLAUDE_BIN } from './config.js';
import type { Channel } from './types.js';

const USER_UNIT_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');

/**
 * The systemd unit name for a channel's *user* schedule (issue #5). The edupudi-reserved Garden
 * pass (issue #11) uses a distinct `edupudi-garden-<id>` unit (see `gardenUnitName`) so the two
 * never collide: a user can freely set/clear their own schedule without touching gardening.
 */
export function userUnitName(channel: Channel): string {
  return `edupudi-${channel.id}`;
}

/**
 * Install a per-channel recurring headless job: `claude -p "<prompt>"` in the channel dir.
 * Claude Code has no native cron, so we use a systemd user timer. The job runs in the
 * channel's directory, so it inherits that channel's CLAUDE.md, memory, and tools — a
 * morning run can update the channel's memory that the live session then sees.
 *
 * @param onCalendar systemd OnCalendar expression, e.g. "*-*-* 08:00:00" or "Mon *-*-* 09:00".
 * @param unit       the systemd unit base name; defaults to this channel's user-schedule unit.
 *                   The Garden pass (issue #11) passes its own reserved `edupudi-garden-<id>` name.
 */
export function installSchedule(
  channel: Channel,
  onCalendar: string,
  prompt: string,
  unit: string = userUnitName(channel),
): string {
  fs.mkdirSync(USER_UNIT_DIR, { recursive: true });

  fs.writeFileSync(
    path.join(USER_UNIT_DIR, `${unit}.service`),
    `[Unit]
Description=edupudi scheduled run for ${channel.name}

[Service]
Type=oneshot
WorkingDirectory=${channel.dir}
ExecStart=${CLAUDE_BIN} -p ${JSON.stringify(prompt)}
`,
  );

  fs.writeFileSync(
    path.join(USER_UNIT_DIR, `${unit}.timer`),
    `[Unit]
Description=edupudi timer for ${channel.name}

[Timer]
OnCalendar=${onCalendar}
Persistent=true

[Install]
WantedBy=timers.target
`,
  );

  try {
    execFileSync('systemctl', ['--user', 'daemon-reload']);
    execFileSync('systemctl', ['--user', 'enable', '--now', `${unit}.timer`]);
  } catch (e) {
    console.warn(`[scheduler] timer written but not enabled (enable manually): ${(e as Error).message}`);
  }
  return unit;
}

export function removeSchedule(channel: Channel, unit: string = userUnitName(channel)): void {
  try {
    execFileSync('systemctl', ['--user', 'disable', '--now', `${unit}.timer`]);
  } catch { /* not enabled */ }
  for (const ext of ['service', 'timer']) {
    fs.rmSync(path.join(USER_UNIT_DIR, `${unit}.${ext}`), { force: true });
  }
}

export interface ScheduleStatus {
  /** True if the .timer unit file exists on disk (a schedule has been written). */
  installed: boolean;
  /** True if systemd reports the timer unit as enabled (wanted by timers.target). */
  enabled: boolean;
  /** True if the timer is currently active/loaded in systemd. */
  active: boolean;
  /** The OnCalendar expression parsed back out of the timer unit, if installed. */
  onCalendar: string | null;
  /** The prompt parsed back out of the service unit, if installed. */
  prompt: string | null;
  /** systemd's human-readable next/last trigger line, best-effort. */
  nextRun: string | null;
  lastRun: string | null;
  /** Result of the last oneshot run (e.g. "success", "exit-code"), best-effort. */
  lastResult: string | null;
}

/** Run a systemctl/systemd query, returning trimmed stdout or null on any failure. */
function query(args: string[]): string | null {
  try {
    return execFileSync('systemctl', args, { encoding: 'utf8' }).trim();
  } catch (e) {
    // `systemctl show` exits non-zero for unknown units but still prints to stdout.
    const out = (e as { stdout?: string }).stdout;
    return typeof out === 'string' && out.trim() ? out.trim() : null;
  }
}

/**
 * Report a channel's schedule state by reading the written unit files and asking systemd.
 * Best-effort: if systemctl is unavailable (e.g. dev box without a user bus), installed/
 * onCalendar/prompt are still recovered from the unit files on disk.
 */
export function scheduleStatus(
  channel: Channel,
  unit: string = userUnitName(channel),
): ScheduleStatus {
  const timerPath = path.join(USER_UNIT_DIR, `${unit}.timer`);
  const servicePath = path.join(USER_UNIT_DIR, `${unit}.service`);
  const installed = fs.existsSync(timerPath);

  let onCalendar: string | null = null;
  let prompt: string | null = null;
  if (installed) {
    const timerText = fs.readFileSync(timerPath, 'utf8');
    onCalendar = timerText.match(/^OnCalendar=(.*)$/m)?.[1]?.trim() ?? null;
  }
  if (fs.existsSync(servicePath)) {
    const serviceText = fs.readFileSync(servicePath, 'utf8');
    // ExecStart=<bin> -p "<json-encoded prompt>" — recover the original string.
    const m = serviceText.match(/ -p (".*")\s*$/m);
    if (m) {
      try { prompt = JSON.parse(m[1]) as string; } catch { prompt = null; }
    }
  }

  let enabled = false;
  let active = false;
  let nextRun: string | null = null;
  let lastRun: string | null = null;
  let lastResult: string | null = null;

  if (installed) {
    enabled = query(['--user', 'is-enabled', `${unit}.timer`]) === 'enabled';
    active = query(['--user', 'is-active', `${unit}.timer`]) === 'active';

    const show = query([
      '--user',
      'show',
      `${unit}.timer`,
      '--property=NextElapseUSecRealtime,LastTriggerUSec',
    ]);
    if (show) {
      for (const line of show.split('\n')) {
        const [k, ...rest] = line.split('=');
        const v = rest.join('=').trim();
        if (!v) continue;
        if (k === 'NextElapseUSecRealtime') nextRun = v;
        else if (k === 'LastTriggerUSec') lastRun = v;
      }
    }

    // The oneshot service carries the result of the most recent run.
    lastResult = query(['--user', 'show', `${unit}.service`, '--property=Result', '--value']) || null;
  }

  return { installed, enabled, active, onCalendar, prompt, nextRun, lastRun, lastResult };
}
