# Raise Claude's cleanupPeriodDays so Parked Threads stay resumable

edupudi's Thread rows live indefinitely, but Claude Code auto-purges session transcripts and
auto-memory after `cleanupPeriodDays` (default 30 days). A Thread that has been Parked (reaped to
free RAM) longer than that would have its `<uuid>.jsonl` silently deleted by Claude, so `--resume`
would fail even though our row still says the Thread exists. To keep Parked Threads resumable, we
**raise `cleanupPeriodDays` to a large value in each Channel's `.claude/settings.json`** at Channel
creation. The invariant this protects: *our Thread rows must not outlive Claude's transcripts.*

## Consequences

- Channel directories accumulate transcript + memory history (disk cost) instead of self-pruning —
  acceptable on the SSD-backed Pi; revisit if disk pressure appears.
- Defense in depth: a `--resume` that still fails (transcript missing for any reason) marks the
  Thread `expired` rather than crashing the Attachment.
- If we ever want true history expiry, it becomes an edupudi-level policy (delete the Thread), not a
  silent Claude-side cleanup.
