# Channel Skills are autonomously created and AI-gardened, quarantine-before-remove

Each Channel's agent creates Channel Skills **autonomously** (no approval gate) — inline during use
(nudged by the Channel's `CLAUDE.md`) and during the weekly Garden pass. Lifecycle is **AI-decided**,
not a deterministic reaper: a weekly `edupudi-garden-<channelId>` systemd timer (reusing #5's
scheduler, reserved and separate from user schedules) fires a headless `claude -p` gardening run that
is handed the aggregated usage ledger (ADR-0005) and default staleness windows, and decides what to
mark Stale, Quarantine, restore, or Remove.

Decay is two-stage with a recoverable middle state: **Active → Stale** (unused > W1, default 30d) →
**Quarantined** (the skill dir is *moved* to `.claude/skills-archive/`, disabling it but keeping it
restorable) → **Removed** (deleted from the archive after a further W2, default 30d, if still
unused). Creation is kept safe not by gating it but by this gardening safety net.

## Consequences

- W1/W2 are guidance the AI receives, not hard cron thresholds — it can keep a rarely-but-genuinely-
  useful skill, or quarantine an obvious dead-end early.
- Quarantine = move to `.claude/skills-archive/`; restore = move back (live within the session);
  Remove = delete from the archive. The four states (Active/Stale/Quarantined/Removed) have clean
  physical homes.
- Best-effort, like ADR-0003: do not add hard guarantees or locking without evidence they're needed.
- Channel Skills are strictly per-Channel; built-in/bundled skills are never created, gardened, or
  removed by edupudi.
