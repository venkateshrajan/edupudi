# tmux session per Thread, not window per Channel

Each Thread (a resumable Claude conversation within a Channel) runs in its own tmux session named
`edupudi-<channelId>-<threadId>`, executing `claude --resume <sessionId>` in the Channel's
directory. We chose this over grouping a Channel's Threads as windows inside one per-Channel tmux
session because tmux clients attached to the same session share a single "current window" — two
Attachments viewing different Threads of one Channel would fight over the active window. Session-
per-Thread makes Attachments fully independent (multiple Threads viewable at once), keeps the
existing `tmux new-session -A` attach pattern, and makes per-Thread idle-reaping (issue #3) a single
`kill-session`. Threads still share the Channel's persona and memory because they run in the same
directory.

## Consequences

- `tmux ls` lists one entry per live Thread rather than per Channel (cosmetic).
- A Channel no longer has a tmux session of its own — it is just a directory; "open a Channel"
  resolves to opening one of its Threads.
