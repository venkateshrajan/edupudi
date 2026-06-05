# Shared Channel memory is best-effort under concurrent Threads

Multiple Threads in the same Channel may be live at once, and they all run `claude` in the same
Channel directory — so they share one auto-memory store (`.memory/MEMORY.md` + topic files). We
accept that **concurrent active memory writes are last-write-wins** (a fact written by one Thread
can be lost if another writes at the same moment) rather than serializing to one-live-Thread-per-
Channel. Two reasons: Claude's auto-memory is *directory*-scoped, so there is no clean way to make
some Threads memory-readers and others writers (settings live in the Channel's `.claude/`, shared by
all its Threads); and this is a single-user system where the real pattern is "one Thread active,
others parked," making simultaneous writes rare. Aggressive idle-reaping (issue #3) keeps the live
set small, shrinking the collision window further.

This is a deliberate limitation, not a bug — do not "fix" it by adding locking without first
confirming it actually bites in practice.

## Consequences

- A lost memory update is possible but expected to be rare; transcripts (per session-id) are never
  affected — only the shared memory store.
- **Assumption to validate:** Claude writes memory via temp-file-and-rename, so the worst case is a
  *lost* update, not a *corrupted* `MEMORY.md`. If writes turn out to be non-atomic, revisit with an
  advisory lock around the memory directory.
- Preserves the "multiple Threads of one Channel viewable at once" benefit asserted in ADR-0001.
