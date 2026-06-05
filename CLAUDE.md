# edupudi — repo context for Claude Code

This repo is **edupudi**, an orchestration app that runs Discord-style channels where each channel
is a live Claude Code session on a Raspberry Pi. Read `DESIGN.md` for the full spec.

## Layout
- `server/` — Node + TS backend: REST + WebSocket, `node-pty`↔`tmux` bridge, SQLite registry,
  channel stamping, systemd-timer scheduler.
- `web/` — React + Vite + xterm.js terminal UI (sidebar of channels + live terminal pane).
- `scripts/new-channel.sh` — standalone channel stamper (mirrors `server/src/channels.ts`).

## Invariants (don't break these)
- **A channel = a directory** under `CHANNELS_ROOT`. System prompt = its `CLAUDE.md`;
  memory pinned via `.claude/settings.json` `autoMemoryDirectory`.
- Channel dirs must **not** live inside a shared git repo — Claude Code keys auto-memory off the
  git root, so sibling channels would share memory. Keep `CHANNELS_ROOT` outside this repo.
- The terminal view **renders** the real TUI (xterm.js); never screen-scrape ANSI to parse output.
- tmux sessions persist across browser disconnects; don't kill them on WS close.

## Conventions
- ESM throughout (`"type": "module"`), NodeNext resolution → import with explicit `.js` specifiers.
- Keep the backend free of business logic that belongs in a channel's `CLAUDE.md`.
