# Channel Skill usage is tracked via a PreToolUse Skill hook + append-only ledger

Claude Code has no built-in skill-usage telemetry, but a `PreToolUse` hook matching the `Skill`
tool fires on every skill invocation with a payload containing `tool_input.skill` (the skill name)
and `cwd` (the Channel directory) — confirmed empirically with a spike. So each Channel installs, at
creation, a `PreToolUse`/`Skill` hook whose command appends one `{ "skill": "...", "ts": <epoch> }`
line to that Channel's `.claude/skill-usage.jsonl`. The ledger is **append-only** (not a
read-modify-write rollup) because multiple Threads in a Channel can invoke skills concurrently
(ADR-0003) and appends avoid the lost-update race. The weekly Garden pass aggregates the ledger to
per-skill last-used and compacts it.

## Consequences

- The hook records ALL skill invocations, including built-in skills; Garden filters to skills that
  exist under `.claude/skills/`, so built-ins are recorded but never pruned.
- The logger reads the payload's `cwd` to target the right Channel's ledger. We install the hook
  per-Channel (in the Channel's `.claude/settings.json`) for isolation, though a single user-level
  hook could in principle serve all Channels by keying on `cwd`.
