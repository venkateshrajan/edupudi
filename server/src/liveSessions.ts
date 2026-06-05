import os from 'node:os';
import { getChannel } from './channels.js';
import { IDLE_TTL_MS, REAP_INTERVAL_MS } from './config.js';
import { killThreadSession } from './pty.js';
import { getThread, setThreadState } from './threads.js';
import type { Channel, Thread } from './types.js';

/**
 * In-memory registry of the Threads whose tmux session is currently Live.
 *
 * A Thread is Live from the moment a PTY attaches its tmux session until the reaper kills it
 * (idle past the TTL) or it exits. We track this in memory rather than the DB because liveness is
 * a runtime property of the process tree, not durable lifecycle state — the durable Live/Parked
 * flag lives on `threads.state` and is set alongside (ADR-0001: reaping a Thread is one
 * `kill-session`; siblings/other Channels are untouched because each Thread keys its own session).
 */
interface LiveSession {
  channelId: string;
  threadId: string;
  /** How many live Attachments (PTY pipes) currently render this Thread; reap only when 0. */
  attachments: number;
  /** Epoch ms of the last attach or PTY I/O — drives idle reaping. */
  lastActivity: number;
}

const live = new Map<string, LiveSession>();

/** Register an Attachment opening on a Thread's tmux session; (re)marks it Live and active. */
export function onAttach(channel: Channel, thread: Thread): void {
  const existing = live.get(thread.id);
  if (existing) {
    existing.attachments += 1;
    existing.lastActivity = Date.now();
    return;
  }
  live.set(thread.id, {
    channelId: channel.id,
    threadId: thread.id,
    attachments: 1,
    lastActivity: Date.now(),
  });
}

/** Bump last-activity on PTY I/O so an actively-streaming Thread is never reaped. */
export function onActivity(threadId: string): void {
  const s = live.get(threadId);
  if (s) s.lastActivity = Date.now();
}

/** Register an Attachment closing; the Thread stays Live (tmux persists across WS close). */
export function onDetach(threadId: string): void {
  const s = live.get(threadId);
  if (!s) return;
  s.attachments = Math.max(0, s.attachments - 1);
  s.lastActivity = Date.now();
}

/** Forget a Thread that is no longer Live (its tmux session is gone). */
export function forgetLive(threadId: string): void {
  live.delete(threadId);
}

export interface LiveSessionInfo {
  channelId: string;
  threadId: string;
  attachments: number;
  lastActivity: number;
  idleMs: number;
}

/** Snapshot of currently-Live Threads (for the status endpoint). */
export function liveSessions(): LiveSessionInfo[] {
  const now = Date.now();
  return [...live.values()].map((s) => ({
    channelId: s.channelId,
    threadId: s.threadId,
    attachments: s.attachments,
    lastActivity: s.lastActivity,
    idleMs: now - s.lastActivity,
  }));
}

/**
 * Reap one pass: kill the tmux session of every Live Thread that has no Attachment and has been
 * idle past the TTL, transitioning it Live → Parked. The transcript and the Channel's shared
 * memory are untouched (ADR-0002), so a later attach resumes via `--resume`. Each Thread keys its
 * own tmux session (ADR-0001), so reaping one never affects siblings or other Channels.
 */
export function reapIdleThreads(now: number = Date.now()): number {
  let reaped = 0;
  for (const s of [...live.values()]) {
    if (s.attachments > 0) continue;
    if (now - s.lastActivity < IDLE_TTL_MS) continue;

    const channel = getChannel(s.channelId);
    const thread = channel ? getThread(channel.id, s.threadId) : undefined;
    // Drop stale entries whose Channel/Thread row vanished (deleted out from under us).
    if (!channel || !thread) {
      live.delete(s.threadId);
      continue;
    }
    killThreadSession(channel, thread);
    setThreadState(thread.id, 'parked');
    live.delete(s.threadId);
    reaped += 1;
  }
  return reaped;
}

let timer: NodeJS.Timeout | undefined;

/** Start the idle reaper on a timer; safe to call once at startup. Unref'd so it never blocks exit. */
export function startReaper(): void {
  if (timer) return;
  timer = setInterval(() => {
    try {
      reapIdleThreads();
    } catch (e) {
      console.error('reaper pass failed:', (e as Error).message);
    }
  }, REAP_INTERVAL_MS);
  timer.unref();
}

export function stopReaper(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

/** Process-wide resource usage for the status endpoint (RAM matters on the 8 GB Pi). */
export interface ResourceUsage {
  liveThreadCount: number;
  rss: number; // resident set size of this server process, bytes
  heapUsed: number; // V8 heap in use, bytes
  systemTotalMem: number; // total system RAM, bytes
  systemFreeMem: number; // free system RAM, bytes
}

export function resourceUsage(): ResourceUsage {
  const mem = process.memoryUsage();
  return {
    liveThreadCount: live.size,
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    systemTotalMem: os.totalmem(),
    systemFreeMem: os.freemem(),
  };
}
