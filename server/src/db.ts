import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH } from './config.js';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    persona    TEXT NOT NULL DEFAULT '',
    dir        TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS threads (
    id         TEXT PRIMARY KEY,             -- UUID; *is* the Claude session-id (ADR-0002)
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    started    INTEGER NOT NULL DEFAULT 0,   -- 0 until first attach runs claude --session-id
    state      TEXT NOT NULL DEFAULT 'live', -- live | parked | expired (lifecycle)
    created_at INTEGER NOT NULL
  );
`);

// Migrate any pre-existing `threads` table: the id *is* the Claude session-id (ADR-0002),
// so there is no separate `session_id` column; `started`/`state` drive launch + lifecycle.
const threadCols = new Set(
  (db.prepare(`PRAGMA table_info(threads)`).all() as { name: string }[]).map((c) => c.name),
);
if (!threadCols.has('started')) {
  db.exec(`ALTER TABLE threads ADD COLUMN started INTEGER NOT NULL DEFAULT 0`);
}
if (!threadCols.has('state')) {
  db.exec(`ALTER TABLE threads ADD COLUMN state TEXT NOT NULL DEFAULT 'live'`);
}
if (threadCols.has('session_id')) {
  db.exec(`ALTER TABLE threads DROP COLUMN session_id`);
}
