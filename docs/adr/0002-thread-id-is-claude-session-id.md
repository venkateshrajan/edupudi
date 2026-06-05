# Thread id is the Claude session-id (pre-assigned UUID)

A Thread's primary id *is* its Claude session-id: we generate a UUID when the Thread is created and
pass it to Claude as `--session-id <uuid>` on first launch, then `--resume <uuid>` thereafter.
We chose this pre-assignment over letting Claude generate the id and capturing it afterward (which
would mean scraping the newest `<id>.jsonl` under `~/.claude/projects/<hash>/` — ambiguous when two
Threads start close together, and dependent on recomputing the project-dir hash). Because the id is
known up front, the `{thread_id → session_id}` mapping the issue envisioned collapses to identity,
so there is **no separate `session_id` column** — `threads.id` is the UUID.

## Consequences

- `threads.id` must be a valid UUID (Claude requires it).
- First-launch vs resume is decided by a `started` flag in our DB, not by probing Claude; we never
  depend on `--session-id` semantics for an already-existing id.
- Human-friendly labelling lives in `threads.title` (also passed as `claude --name`), not in the id.
