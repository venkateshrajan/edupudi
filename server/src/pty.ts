import { spawn, type IPty } from 'node-pty';
import { CLAUDE_BIN, TMUX_PREFIX } from './config.js';
import type { Channel } from './types.js';

export function sessionName(channel: Channel): string {
  return `${TMUX_PREFIX}-${channel.id}`;
}

/**
 * Attach a PTY to the channel's tmux session.
 * `tmux new-session -A` attaches if the session exists, otherwise creates it running
 * `claude` in the channel directory. The tmux session outlives the PTY/WebSocket, so the
 * Claude session persists across browser disconnects (reattach to resume exactly where it was).
 */
export function attach(channel: Channel, cols: number, rows: number): IPty {
  const name = sessionName(channel);
  // Force a UTF-8 locale so claude/tmux emit UTF-8; `tmux -u` forces UTF-8 regardless of locale.
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    LANG: process.env.LANG ?? 'C.UTF-8',
    LC_ALL: process.env.LC_ALL ?? process.env.LANG ?? 'C.UTF-8',
  };
  return spawn(
    'tmux',
    ['-u', 'new-session', '-A', '-s', name, '-c', channel.dir, CLAUDE_BIN],
    {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: channel.dir,
      env,
    },
  );
}
