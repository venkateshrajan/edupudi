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

# Install the edupudi-reserved weekly Channel Skill Garden timer (issue #11, ADR-0006), distinct
# from the user-schedule unit (edupudi-$slug). It fires a headless `claude -p` Garden pass that
# marks skills stale → quarantine (move to .claude/skills-archive/) → remove. W1/W2 are guidance.
unit="edupudi-garden-$slug"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
claude_bin="${CLAUDE_BIN:-claude}"
stale_days="${GARDEN_STALE_DAYS:-30}"
remove_days="${GARDEN_REMOVE_DAYS:-30}"
on_calendar="${GARDEN_ON_CALENDAR:-Mon *-*-* 03:00:00}"
mkdir -p "$unit_dir"

read -r -d '' garden_prompt <<PROMPT || true
You are the weekly Channel Skill Garden for this edupudi channel (ADR-0006). Maintain the lifecycle
of THIS channel's Channel Skills — the skill directories under .claude/skills/ (each is a directory
containing a SKILL.md). NEVER touch built-in/bundled Claude Code skills: only directories under
.claude/skills/ (live) and .claude/skills-archive/ (quarantined) are Channel Skills you may garden.
W1 = $stale_days days (Active -> Stale). W2 = $remove_days days (Quarantined + still unused -> Removed).
These windows are GUIDANCE — you make the final call. Steps, in order: aggregate
.claude/skill-usage.jsonl (append-only {skill,ts} per line, ts epoch ms) to per-skill last-used +
counts (skip torn lines); mark Stale any .claude/skills/ skill unused within W1; QUARANTINE each
Stale unused skill by moving its dir .claude/skills/<name> -> .claude/skills-archive/<name>; RESTORE
wrongly-quarantined ones by moving them back; REMOVE (rm -rf) archived skills still unused beyond a
further W2 (conservative); dedupe/merge near-duplicates and you may propose new skills for recurring
patterns; then COMPACT .claude/skill-usage.jsonl to at most one {skill,ts} line per still-existing
skill. Built-in skills have no .claude/skills/ dir, so never quarantine or remove them.
PROMPT

# Encode the prompt as a JSON string for a safe single-line ExecStart argument.
garden_prompt_json="$(printf '%s' "$garden_prompt" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$garden_prompt")"

cat > "$unit_dir/$unit.service" <<SERVICE
[Unit]
Description=edupudi scheduled run for $name

[Service]
Type=oneshot
WorkingDirectory=$dir
ExecStart=$claude_bin -p $garden_prompt_json
SERVICE

cat > "$unit_dir/$unit.timer" <<TIMER
[Unit]
Description=edupudi timer for $name

[Timer]
OnCalendar=$on_calendar
Persistent=true

[Install]
WantedBy=timers.target
TIMER

if systemctl --user daemon-reload 2>/dev/null && systemctl --user enable --now "$unit.timer" 2>/dev/null; then
  echo "garden timer enabled: $unit.timer"
else
  echo "garden timer written but not enabled (enable manually): systemctl --user enable --now $unit.timer" >&2
fi

echo "created channel '$slug' at $dir"
echo "open a live session:  tmux new-session -A -s edupudi-$slug -c \"$dir\" claude"
