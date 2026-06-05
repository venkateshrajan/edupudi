import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { MAIN_THREAD_TITLE, type Thread, type ThreadState } from './types.js';

// SQLite stores booleans as 0/1; map the raw row into a typed Thread.
interface ThreadRow {
  id: string;
  channel_id: string;
  title: string;
  started: number;
  state: string;
  created_at: number;
}

const toThread = (r: ThreadRow): Thread => ({
  id: r.id,
  channel_id: r.channel_id,
  title: r.title,
  started: r.started === 1,
  state: r.state as ThreadState,
  created_at: r.created_at,
});

export function isMainThread(t: Thread): boolean {
  return t.title === MAIN_THREAD_TITLE;
}

export function listThreads(channelId: string): Thread[] {
  const rows = db
    .prepare('SELECT * FROM threads WHERE channel_id = ? ORDER BY created_at')
    .all(channelId) as ThreadRow[];
  return rows.map(toThread);
}

export function getThread(channelId: string, threadId: string): Thread | undefined {
  const row = db
    .prepare('SELECT * FROM threads WHERE channel_id = ? AND id = ?')
    .get(channelId, threadId) as ThreadRow | undefined;
  return row ? toThread(row) : undefined;
}

/** The undeletable default Thread (`main`) every Channel lands on when no thread is specified. */
export function getMainThread(channelId: string): Thread | undefined {
  const row = db
    .prepare('SELECT * FROM threads WHERE channel_id = ? AND title = ? ORDER BY created_at LIMIT 1')
    .get(channelId, MAIN_THREAD_TITLE) as ThreadRow | undefined;
  return row ? toThread(row) : undefined;
}

/**
 * Lazy create (ADR-0002): insert a row with a pre-assigned UUID and `started=false`; do NOT
 * launch claude. The id *is* the Claude session-id used later for --session-id/--resume.
 */
export function createThread(channelId: string, title?: string): Thread {
  const id = randomUUID();
  const created_at = Date.now();
  const t = (title ?? '').trim();
  db.prepare(
    'INSERT INTO threads (id, channel_id, title, started, state, created_at) VALUES (?, ?, ?, 0, ?, ?)',
  ).run(id, channelId, t, 'live', created_at);
  return { id, channel_id: channelId, title: t, started: false, state: 'live', created_at };
}

/** Create a Channel's undeletable default Thread titled `main`. */
export function createMainThread(channelId: string): Thread {
  return createThread(channelId, MAIN_THREAD_TITLE);
}

export function renameThread(channelId: string, threadId: string, title: string): Thread | undefined {
  const existing = getThread(channelId, threadId);
  if (!existing) return undefined;
  db.prepare('UPDATE threads SET title = ? WHERE channel_id = ? AND id = ?').run(
    title.trim(),
    channelId,
    threadId,
  );
  return getThread(channelId, threadId);
}

export function deleteThreadRow(channelId: string, threadId: string): void {
  db.prepare('DELETE FROM threads WHERE channel_id = ? AND id = ?').run(channelId, threadId);
}

export function markStarted(threadId: string): void {
  db.prepare('UPDATE threads SET started = 1, state = ? WHERE id = ?').run('live', threadId);
}

export function setThreadState(threadId: string, state: ThreadState): void {
  db.prepare('UPDATE threads SET state = ? WHERE id = ?').run(state, threadId);
}
