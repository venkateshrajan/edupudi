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
