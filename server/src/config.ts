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
