# edupudi — design spec

*edupudi* (எடுபிடி, "right-hand helper") — a self-hosted orchestration app that runs many
isolated Claude Code agents on a Raspberry Pi, presented as Discord-style channels and threads,
each with its own persona, memory, tools, and schedule.

## Purpose
A personal "life OS": one place to talk to domain-specific agents (self/health, family, work,
business, side-hustle, native-house, finance) — each a live Claude Code session shown directly,
not a chat-box reskin.

## Core model
- **Channel = a project directory** on the Pi. This single decision yields isolation for free:
  - System prompt → `CLAUDE.md` in the channel dir (written at creation).
  - Memory → per-project auto-memory (`~/.claude/projects/<cwd-hash>/memory/`), optionally pinned
    via `autoMemoryDirectory` in the channel's `.claude/settings.json`.
  - Tools → `.mcp.json` in the channel dir (e.g. Kaasu MCP).
  - Schedule → a systemd timer scoped to the channel dir running `claude -p`.
- **Thread = a Claude Code session** (`claude --resume <session-id>`) inside the channel dir.
  Threads share the channel's memory/persona; each has its own transcript.
- **Showing the CLI** = render the real interactive TUI in the browser via xterm.js, backed by a
  PTY/tmux session for persistence (reattach after disconnect).

## Memory: 3 tiers (+ gotchas)
- `~/.claude/CLAUDE.md` → universal facts (global, applies to all channels).
- `/channels/<x>/CLAUDE.md` → that channel's persona.
- per-project auto-memory → learnings the agent writes for that channel.
- Gotchas to enforce in channel-creation:
  - Auto-memory is keyed off the **git repo root**; worktrees of one repo SHARE memory.
    → each channel dir must be its own repo or **not** a git repo (avoid one parent repo).
  - `~/.claude/CLAUDE.md` and `~/.claude/rules/` are global — keep channel-specific content out of them.
  - Pin `autoMemoryDirectory` per channel for zero ambiguity.

## Scheduling
- Claude Code has **no native per-channel cron**. Use **systemd timers**, one per channel, each
  `WorkingDirectory=/channels/<x>` running `claude -p "..."`. Scheduled runs share the channel's
  memory, so morning jobs can update memory the live session then sees.

## Integrations
- **Anthropic API** (API key billing — supported path for an unattended backend).
- **Kaasu MCP** per channel that needs finance.
- **Obsidian vault** as the durable knowledge layer (one shared vault + a walled-off work vault),
  accessed via Claude Code's file tools.

## Deployment target
- Raspberry Pi 5 (8 GB), SSD/NVMe (state/memory writes), active cooling.
- Lazily start a channel's session on first open; let idle ones exit to bound RAM.

## Channel-creation = one operation
`mkdir` + write `CLAUDE.md` + `.claude/settings.json` (autoMemoryDirectory) + `.mcp.json`
+ spawn tmux/PTY session + install a systemd timer.

## Stack decisions (chosen)
- **Backend:** Node.js + TypeScript — Express + `ws` + `node-pty` + `better-sqlite3` (ESM, NodeNext).
- **Frontend:** React + Vite + `@xterm/xterm` (+ fit addon).
- **Claude integration:** live terminal mirror — one `tmux` session per channel, attached via
  `node-pty`, streamed to xterm.js over WebSocket. Renders the real TUI (never scrape it).
- **Access:** single-user over Tailscale — bind loopback, expose with `tailscale serve`.

## Scaffold status
- ✅ Project skeleton, channel registry (SQLite), channel stamping, PTY/tmux bridge, WS server,
  systemd-timer scheduler, React terminal UI, standalone `new-channel.sh`.
- ⬜ Threads (schema present; UI is single-session — map thread → `claude --resume <id>` next).
- ⬜ Channel-creation form (currently `window.prompt`), schedule UI, lazy session start/idle reap.
- ⬜ `npm install` + first run on the Pi (native deps: `node-pty`, `better-sqlite3`).
