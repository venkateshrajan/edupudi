import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type IPty } from 'node-pty';
import { CLAUDE_BIN, TMUX_PREFIX } from './config.js';
import { markStarted, setThreadState } from './threads.js';
import type { Channel, Thread } from './types.js';

/** Per-Thread tmux session name `edupudi-<channelId>-<threadId>` (ADR-0001). */
export function sessionName(channel: Channel, thread: Thread): string {
  return `${TMUX_PREFIX}-${channel.id}-${thread.id}`;
}

/**
 * Attach a PTY to a Thread's own tmux session (session-per-Thread, ADR-0001).
 *
 * `tmux new-session -A` re-attaches if the session already exists, otherwise creates it running
 * `claude` in the Channel directory — so Threads of one Channel share its persona/memory but have
 * independent Attachments. The tmux session outlives the PTY/WebSocket, so the Claude session
 * (transcript) persists across browser disconnects.
 *
 * First attach launches `claude --session-id <threadId>` and marks the Thread started; later
 * attaches use `claude --resume <threadId>` (ADR-0002). The Thread title is passed as `--name`.
 */
export function attach(channel: Channel, thread: Thread, cols: number, rows: number): IPty {
  const name = sessionName(channel, thread);
  // Force a UTF-8 locale so claude/tmux emit UTF-8; `tmux -u` forces UTF-8 regardless of locale.
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    LANG: process.env.LANG ?? 'C.UTF-8',
    LC_ALL: process.env.LC_ALL ?? process.env.LANG ?? 'C.UTF-8',
  };

  // The thread id *is* the Claude session-id: --session-id on first start, --resume thereafter.
  // Defense in depth (ADR-0004): if a started Thread's transcript is gone (auto-purged for any
  // reason), --resume would fail and crash the Attachment. Surface it as `expired` and start a
  // fresh transcript under the same id instead of crashing.
  let useResume = thread.started;
  if (useResume && !transcriptExists(thread)) {
    setThreadState(thread.id, 'expired');
    useResume = false;
  }
  const claudeArgs = useResume
    ? ['--resume', thread.id]
    : ['--session-id', thread.id];
  if (thread.title) claudeArgs.push('--name', thread.title);

  const term = spawn(
    'tmux',
    ['-u', 'new-session', '-A', '-s', name, '-c', channel.dir, CLAUDE_BIN, ...claudeArgs],
    {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: channel.dir,
      env,
    },
  );

  // Mark started after the first launch so subsequent attaches resume rather than re-create.
  // (If the tmux session already existed, the trailing command is ignored by tmux and we simply
  // re-attached — but the Thread was already started, so this branch isn't reached then.)
  if (!useResume) markStarted(thread.id);
  // Re-attaching a Parked Thread (reaped to free RAM, issue #3) revives its tmux session, so it is
  // Live again. markStarted already set 'live' on the first-launch path; restore it on resume too
  // so a previously-reaped Thread doesn't stay 'parked' once it's running again.
  else if (thread.state === 'parked') setThreadState(thread.id, 'live');

  return term;
}

/** Whether a Thread's Claude transcript (`<threadId>.jsonl`) still exists under any project dir. */
function transcriptExists(thread: Thread): boolean {
  const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projectsRoot)) return false;
  const file = `${thread.id}.jsonl`;
  let dirs: fs.Dirent[];
  try {
    dirs = fs.readdirSync(projectsRoot, { withFileTypes: true });
  } catch {
    return false;
  }
  return dirs.some(
    (d) => d.isDirectory() && fs.existsSync(path.join(projectsRoot, d.name, file)),
  );
}

/** Kill a Thread's tmux session (best-effort; no-op if it isn't live). */
export function killThreadSession(channel: Channel, thread: Thread): void {
  spawnSync('tmux', ['kill-session', '-t', sessionName(channel, thread)], { stdio: 'ignore' });
}

/**
 * Purge a Thread's Claude transcript. The id *is* the Claude session-id, so the transcript is the
 * `<threadId>.jsonl` Claude writes under `~/.claude/projects/<dir-hash>/`. We recompute the hash
 * for the Channel directory; defensively, we also sweep any matching file across project dirs in
 * case the hash scheme differs. Deleting the transcript never touches Channel memory (ADR-0002).
 */
export function purgeThreadTranscript(channel: Channel, thread: Thread): void {
  const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projectsRoot)) return;
  const file = `${thread.id}.jsonl`;
  let dirs: string[];
  try {
    dirs = fs.readdirSync(projectsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(projectsRoot, d.name));
  } catch {
    return;
  }
  for (const dir of dirs) {
    const candidate = path.join(dir, file);
    try {
      if (fs.existsSync(candidate)) fs.rmSync(candidate, { force: true });
    } catch {
      /* best-effort */
    }
  }
}
