import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { CHANNELS_ROOT, CLEANUP_PERIOD_DAYS } from './config.js';
import { createMainThread, getMainThread } from './threads.js';
import type { Channel } from './types.js';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function listChannels(): Channel[] {
  return db.prepare('SELECT * FROM channels ORDER BY created_at').all() as Channel[];
}

export function getChannel(id: string): Channel | undefined {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Channel | undefined;
}

export interface CreateChannelInput {
  name: string;
  persona?: string;
  systemPrompt: string;
  mcp?: Record<string, unknown>;
}

/**
 * Stamp a fully-isolated channel: directory + CLAUDE.md (system prompt) +
 * .claude/settings.json (pins per-channel auto-memory) + optional .mcp.json (tools).
 */
export function createChannel(input: CreateChannelInput): Channel {
  const id = slugify(input.name);
  if (!id) throw new Error('invalid channel name');
  if (getChannel(id)) throw new Error(`channel "${id}" already exists`);

  const dir = path.join(CHANNELS_ROOT, id);
  // NOTE: CHANNELS_ROOT must be outside any git repo — Claude Code keys auto-memory
  // off the git root, so sibling channels under one repo would share memory.
  const memDir = path.join(dir, '.memory');
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.mkdirSync(memDir, { recursive: true });

  // 1) system prompt = CLAUDE.md (auto-loaded every session, interactive or headless)
  fs.writeFileSync(
    path.join(dir, 'CLAUDE.md'),
    renderClaudeMd(input.name, input.persona ?? '', input.systemPrompt),
  );

  // 2) per-channel settings: pin auto-memory inside the channel dir for zero ambiguity, and
  //    raise cleanupPeriodDays so Parked Threads' transcripts outlive Claude's default 30-day
  //    auto-purge — our Thread rows must not outlive their transcripts (ADR-0004).
  fs.writeFileSync(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify(
      {
        autoMemoryEnabled: true,
        autoMemoryDirectory: memDir,
        cleanupPeriodDays: CLEANUP_PERIOD_DAYS,
      },
      null,
      2,
    ),
  );

  // 3) per-channel tools
  if (input.mcp) {
    fs.writeFileSync(
      path.join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: input.mcp }, null, 2),
    );
  }

  const channel: Channel = {
    id,
    name: input.name,
    persona: input.persona ?? '',
    dir,
    created_at: Date.now(),
  };
  db.prepare(
    'INSERT INTO channels (id, name, persona, dir, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(channel.id, channel.name, channel.persona, channel.dir, channel.created_at);

  // Every Channel has an undeletable default Thread titled `main`; opening a Channel lands on it.
  createMainThread(channel.id);

  return channel;
}

function renderClaudeMd(name: string, persona: string, systemPrompt: string): string {
  const head = persona ? `${persona}\n\n` : '';
  return `# ${name}\n\n${head}${systemPrompt}\n`;
}

/** Trivial startup backfill: ensure every pre-existing Channel has its `main` Thread. */
export function backfillMainThreads(): void {
  for (const c of listChannels()) {
    if (!getMainThread(c.id)) createMainThread(c.id);
  }
}
