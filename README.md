# edupudi

*edupudi* (எடுபிடி, "right-hand helper") — a self-hosted orchestration app. Discord-style
**channels**, but instead of a chat box each channel shows a **live Claude Code session** running
on a Raspberry Pi. Each channel has its own persona (system prompt), memory, tools, and schedule.

See [DESIGN.md](./DESIGN.md) for the full spec and rationale.

## Stack
- **Backend:** Node.js + TypeScript (Express + `ws` + `node-pty` + `better-sqlite3`)
- **Frontend:** React + Vite + `@xterm/xterm` (real terminal emulator)
- **Claude view:** live terminal mirror — `tmux` session per channel, attached via `node-pty`
- **Access:** single-user over Tailscale (bind loopback, `tailscale serve`)

## Core model
- **Channel = a directory** under `CHANNELS_ROOT` (default `~/edupudi-channels`). Stamping a channel
  writes its `CLAUDE.md` (system prompt), `.claude/settings.json` (pins per-channel auto-memory),
  and optional `.mcp.json` (tools). A `tmux` session `edupudi-<id>` runs `claude` in that dir.
- **Thread = a Claude Code session** (`claude --resume <id>`) inside the channel dir _(next step;
  schema is in place, UI is single-session for now)_.

## Quick start
```bash
cp .env.example .env          # set ANTHROPIC_API_KEY, paths
npm install                   # builds native deps (node-pty, better-sqlite3)
npm run dev                   # server on :8787, web on :5173 (proxied)
```
Then open the web app, create a channel, and the live `claude` TUI appears in the pane.

Stamp a channel from the CLI instead:
```bash
npm run new-channel -- business "You are the Business operator agent. Goal: ..."
```

## Raspberry Pi notes
- Native modules: if `node-pty` fails to build on ARM, swap to
  `@homebridge/node-pty-prebuilt-multiarch` (prebuilt for ARM64). Install `build-essential` otherwise.
- Put the DB/channels on the SSD, not the SD card (constant memory/session writes).
- Expose privately: `tailscale serve 8787` — do **not** publish to the internet.

## Scheduling
No native Claude Code cron. Per-channel **systemd user timers** run `claude -p` in the channel dir
(see `server/src/scheduler.ts`). Scheduled runs share the channel's memory.
