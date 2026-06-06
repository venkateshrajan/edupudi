#!/usr/bin/env bash
# Standalone channel stamper — mirrors server/src/channels.ts.
# Usage: scripts/new-channel.sh <name> "<system prompt>"
set -euo pipefail

name="${1:?usage: new-channel.sh <name> \"<system prompt>\"}"
prompt="${2:-You are the ${name} agent.}"

root="${CHANNELS_ROOT:-$HOME/edupudi-channels}"
slug="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')"
dir="$root/$slug"

# Absolute path to the compiled Skill-usage logger (server/dist/skill-logger.js), resolved from
# this script's location so the PreToolUse hook command is absolute regardless of cwd (ADR-0005).
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
logger="$script_dir/../server/dist/skill-logger.js"

[ -e "$dir" ] && { echo "channel already exists: $dir" >&2; exit 1; }

# WARNING: $root must be outside any git repo — Claude Code keys auto-memory off the git
# root, so sibling channels under one repo would share memory.
# The Channel Skill subsystem (ADR-0005/0006): live skills dir + the Garden's quarantine archive.
mkdir -p "$dir/.claude/skills" "$dir/.claude/skills-archive" "$dir/.memory"

# Skill-authoring guidance is appended so the agent captures recurring workflows as skills (ADR-0006).
cat > "$dir/CLAUDE.md" <<MD
# $name

$prompt

## Authoring skills

When you notice a workflow you keep repeating in this channel — a genuinely recurring, reusable
sequence of steps — capture it as a skill under \`.claude/skills/\`. Each skill is a directory
containing a \`SKILL.md\`.

- Only create a skill for something genuinely recurring and reusable — not a one-off.
- Write a sharp, specific \`description\` so it triggers at the right moment and nothing else.
- Keep each skill focused on a single workflow; prefer several small skills over one sprawling one.

Skills you author here are scoped to this channel. Unused ones are periodically reviewed and may be
archived, so keep the set lean and current.
MD

# Raise cleanupPeriodDays so Parked Threads' transcripts outlive Claude's 30-day auto-purge (ADR-0004).
# Wire a PreToolUse/Skill hook to the edupudi logger so every skill invocation appends to this
# channel's append-only usage ledger (ADR-0005).
cat > "$dir/.claude/settings.json" <<JSON
{
  "autoMemoryEnabled": true,
  "autoMemoryDirectory": "$dir/.memory",
  "cleanupPeriodDays": 36500,
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$logger\""
          }
        ]
      }
    ]
  }
}
JSON

echo "created channel '$slug' at $dir"
echo "open a live session:  tmux new-session -A -s edupudi-$slug -c \"$dir\" claude"
