import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CLAUDE_BIN } from './config.js';
import type { Channel } from './types.js';

const USER_UNIT_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');

/**
 * Install a per-channel recurring headless job: `claude -p "<prompt>"` in the channel dir.
 * Claude Code has no native cron, so we use a systemd user timer. The job runs in the
 * channel's directory, so it inherits that channel's CLAUDE.md, memory, and tools — a
 * morning run can update the channel's memory that the live session then sees.
 *
 * @param onCalendar systemd OnCalendar expression, e.g. "*-*-* 08:00:00" or "Mon *-*-* 09:00".
 */
export function installSchedule(channel: Channel, onCalendar: string, prompt: string): string {
  fs.mkdirSync(USER_UNIT_DIR, { recursive: true });
  const unit = `edupudi-${channel.id}`;

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

export function removeSchedule(channel: Channel): void {
  const unit = `edupudi-${channel.id}`;
  try {
    execFileSync('systemctl', ['--user', 'disable', '--now', `${unit}.timer`]);
  } catch { /* not enabled */ }
  for (const ext of ['service', 'timer']) {
    fs.rmSync(path.join(USER_UNIT_DIR, `${unit}.${ext}`), { force: true });
  }
}
