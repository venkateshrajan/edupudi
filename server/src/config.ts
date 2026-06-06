import os from 'node:os';
import path from 'node:path';

export const PORT = Number(process.env.PORT ?? 8787);
export const BIND_ADDR = process.env.BIND_ADDR ?? '127.0.0.1';

export const CHANNELS_ROOT = process.env.CHANNELS_ROOT
  ? path.resolve(process.env.CHANNELS_ROOT)
  : path.join(os.homedir(), 'edupudi-channels');

export const DB_PATH =
  process.env.EDUPUDI_DB ?? path.join(os.homedir(), '.edupudi', 'edupudi.db');

export const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';
export const TMUX_PREFIX = 'edupudi';

// Raised so Claude doesn't auto-purge a Parked Thread's transcript before we resume it (ADR-0004).
export const CLEANUP_PERIOD_DAYS = Number(process.env.CLEANUP_PERIOD_DAYS ?? 36500);

// Idle reaping (issue #3): a Live Thread with no Attachment and no I/O for this long is reaped —
// its tmux session is killed (Live → Parked) to bound RAM on the 8 GB Pi. Configurable via env.
// Default: 30 minutes. REAP_INTERVAL_MS is how often the reaper evaluates idleness.
export const IDLE_TTL_MS = Number(process.env.IDLE_TTL_MS ?? 30 * 60 * 1000);
export const REAP_INTERVAL_MS = Number(process.env.REAP_INTERVAL_MS ?? 60 * 1000);

// Channel Skill gardening (issue #11, ADR-0006). Each Channel gets an edupudi-reserved weekly
// `edupudi-garden-<channelId>` timer (separate from the user-schedule unit, issue #5) that fires a
// headless `claude -p` Garden pass. W1/W2 are GUIDANCE handed to the prompt — the AI makes the
// final lifecycle call (ADR-0006), these are not hard cron thresholds. All overridable via env.
//   GARDEN_STALE_DAYS  (W1): unused longer than this → Stale → Quarantine candidate. Default 30d.
//   GARDEN_REMOVE_DAYS (W2): Quarantined + still unused this much longer → Remove. Default 30d.
//   GARDEN_ON_CALENDAR: systemd OnCalendar cadence for the weekly Garden pass. Default Mon 03:00.
export const GARDEN_STALE_DAYS = Number(process.env.GARDEN_STALE_DAYS ?? 30);
export const GARDEN_REMOVE_DAYS = Number(process.env.GARDEN_REMOVE_DAYS ?? 30);
export const GARDEN_ON_CALENDAR = process.env.GARDEN_ON_CALENDAR ?? 'Mon *-*-* 03:00:00';
