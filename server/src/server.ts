import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { PORT, BIND_ADDR } from './config.js';
import { listChannels, getChannel, createChannel, backfillMainThreads } from './channels.js';
import {
  listThreads,
  getThread,
  getMainThread,
  createThread,
  renameThread,
  deleteThreadRow,
  isMainThread,
} from './threads.js';
import { installSchedule } from './scheduler.js';
import { attach, killThreadSession, purgeThreadTranscript } from './pty.js';

const app = express();
app.use(express.json());

app.get('/api/channels', (_req, res) => {
  res.json(listChannels());
});

app.get('/api/channels/:id', (req, res) => {
  const c = getChannel(req.params.id);
  if (!c) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json(c);
});

app.post('/api/channels', (req, res) => {
  try {
    const { name, persona, systemPrompt, mcp } = req.body ?? {};
    if (!name || !systemPrompt) {
      res.status(400).json({ error: 'name and systemPrompt are required' });
      return;
    }
    res.status(201).json(createChannel({ name, persona, systemPrompt, mcp }));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post('/api/channels/:id/schedule', (req, res) => {
  const c = getChannel(req.params.id);
  if (!c) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const { onCalendar, prompt } = req.body ?? {};
  if (!onCalendar || !prompt) {
    res.status(400).json({ error: 'onCalendar and prompt are required' });
    return;
  }
  res.json({ unit: installSchedule(c, onCalendar, prompt) });
});

// --- Threads ------------------------------------------------------------------------------------

app.get('/api/channels/:id/threads', (req, res) => {
  const c = getChannel(req.params.id);
  if (!c) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json(listThreads(c.id));
});

// Lazy create: insert a row only (started=false); claude/tmux start on first attach.
app.post('/api/channels/:id/threads', (req, res) => {
  const c = getChannel(req.params.id);
  if (!c) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const { title } = req.body ?? {};
  res.status(201).json(createThread(c.id, typeof title === 'string' ? title : undefined));
});

app.patch('/api/channels/:id/threads/:tid', (req, res) => {
  const c = getChannel(req.params.id);
  if (!c) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const { title } = req.body ?? {};
  if (typeof title !== 'string') {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const updated = renameThread(c.id, req.params.tid, title);
  if (!updated) {
    res.status(404).json({ error: 'thread not found' });
    return;
  }
  res.json(updated);
});

// Delete a non-`main` Thread: kill its tmux session and purge its transcript, leaving Channel
// memory intact (ADR-0002). Deleting `main` is rejected with 409.
app.delete('/api/channels/:id/threads/:tid', (req, res) => {
  const c = getChannel(req.params.id);
  if (!c) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  const t = getThread(c.id, req.params.tid);
  if (!t) {
    res.status(404).json({ error: 'thread not found' });
    return;
  }
  if (isMainThread(t)) {
    res.status(409).json({ error: 'cannot delete main thread' });
    return;
  }
  killThreadSession(c, t);
  purgeThreadTranscript(c, t);
  deleteThreadRow(c.id, t.id);
  res.status(204).end();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '', 'http://localhost');
  const channelId = url.searchParams.get('channel');
  const channel = channelId ? getChannel(channelId) : undefined;
  if (!channel) {
    ws.close(1008, 'unknown channel');
    return;
  }

  // Resolve the Thread: an explicit `thread` query param, else the Channel's `main` Thread.
  const threadId = url.searchParams.get('thread');
  const thread = threadId ? getThread(channel.id, threadId) : getMainThread(channel.id);
  if (!thread) {
    ws.close(1008, 'unknown thread');
    return;
  }

  const term = attach(channel, thread, 80, 24);
  term.onData((d) => {
    try { ws.send(d); } catch { /* socket closing */ }
  });
  term.onExit(() => {
    try { ws.close(); } catch { /* already closed */ }
  });

  ws.on('message', (raw) => {
    let msg: { type?: string; data?: string; cols?: number; rows?: number };
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'input' && typeof msg.data === 'string') term.write(msg.data);
    else if (msg.type === 'resize' && msg.cols && msg.rows) term.resize(msg.cols, msg.rows);
  });

  // Detach the PTY on disconnect but leave the tmux session alive (persistence).
  ws.on('close', () => {
    try { term.kill(); } catch { /* already gone */ }
  });
});

backfillMainThreads();

server.listen(PORT, BIND_ADDR, () => {
  console.log(`edupudi server → http://${BIND_ADDR}:${PORT}`);
  console.log(`expose privately with: tailscale serve ${PORT}`);
});
