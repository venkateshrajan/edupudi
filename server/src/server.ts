import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { PORT, BIND_ADDR } from './config.js';
import { listChannels, getChannel, createChannel } from './channels.js';
import { installSchedule } from './scheduler.js';
import { attach } from './pty.js';

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

  const term = attach(channel, 80, 24);
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

server.listen(PORT, BIND_ADDR, () => {
  console.log(`edupudi server → http://${BIND_ADDR}:${PORT}`);
  console.log(`expose privately with: tailscale serve ${PORT}`);
});
