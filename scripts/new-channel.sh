#!/usr/bin/env bash
# Standalone channel stamper — mirrors server/src/channels.ts.
# Usage: scripts/new-channel.sh <name> "<system prompt>"
set -euo pipefail

name="${1:?usage: new-channel.sh <name> \"<system prompt>\"}"
prompt="${2:-You are the ${name} agent.}"

root="${CHANNELS_ROOT:-$HOME/edupudi-channels}"
slug="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')"
dir="$root/$slug"

[ -e "$dir" ] && { echo "channel already exists: $dir" >&2; exit 1; }

# WARNING: $root must be outside any git repo — Claude Code keys auto-memory off the git
# root, so sibling channels under one repo would share memory.
mkdir -p "$dir/.claude" "$dir/.memory"

printf '# %s\n\n%s\n' "$name" "$prompt" > "$dir/CLAUDE.md"

cat > "$dir/.claude/settings.json" <<JSON
{
  "autoMemoryEnabled": true,
  "autoMemoryDirectory": "$dir/.memory"
}
JSON

echo "created channel '$slug' at $dir"
echo "open a live session:  tmux new-session -A -s edupudi-$slug -c \"$dir\" claude"
