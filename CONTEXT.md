# edupudi

A self-hosted orchestrator presenting Discord-style **Channels**, each running live Claude Code
conversations on a Raspberry Pi. This document fixes the domain language so code, docs, and
conversation stay aligned.

## Language

**Channel**:
A project directory on the host that supplies a persona, memory, and tools to the Claude
conversations held inside it. One Channel per area of life (work, business, native-house, …).
_Avoid_: workspace, project, room

**Thread**:
A resumable Claude conversation within a Channel — one transcript whose **id *is* its Claude
session-id** (a UUID pre-assigned at creation). Threads in the same Channel share that Channel's
persona and memory but keep separate histories.
_Avoid_: conversation, chat, session

**Attachment**:
The live PTY + WebSocket pipe that renders a Thread's terminal in the browser. Ephemeral — it dies
on disconnect; the Thread it was viewing survives.
_Avoid_: connection, session, terminal

**Parked Thread**:
A Thread whose live tmux/`claude` process has been killed (reaped) to free memory, but whose
transcript is intact — reopening resumes it. A Parked Thread is *not* deleted.

**Reap**:
To kill a Live Thread's process to free RAM, leaving it Parked and resumable. Reaping is not
deletion; deletion destroys a Thread (kills it, removes its transcript) and only ever applies to
non-`main` Threads.

**Channel Skill**:
A `SKILL.md` authored by a Channel's own agent under that Channel's `.claude/skills/`, capturing a
recurring workflow for that Channel. Strictly Channel-scoped. Built-in/bundled Claude Code skills
are *not* Channel Skills and are never gardened or pruned by edupudi. A Channel Skill is **Active**
(invoked within the staleness window), **Stale** (a prune candidate), **Quarantined** (disabled but
recoverable), or **Removed** (`SKILL.md` deleted).
_Avoid_: "skill" unqualified (collides with Claude Code's built-in skills)

**Garden**:
The periodic AI-driven review of a Channel's Skills that marks them Active/Stale, Quarantines unused
ones, restores wrongly-quarantined ones, and may propose new ones. Gardening is to Channel Skills
what Reaping is to Threads — best-effort housekeeping the AI decides, not a hard deterministic sweep.

## Relationships

- A **Channel** contains one or more **Threads** — it always has at least one
- The first Thread, titled `main`, is the Channel's **default Thread** and cannot be deleted;
  opening a Channel attaches its default Thread (other Threads are reached as tabs)
- A **Thread**'s id is its Claude session-id; it lives in its Channel's directory (so it inherits
  that Channel's persona + memory)
- An **Attachment** renders exactly one **Thread**; a Thread may have zero or one live Attachment
- A **Channel** owns zero or more **Channel Skills**; **Garden** moves each between Active → Stale →
  Quarantined → Removed (Quarantine is reversible; Removal deletes the `SKILL.md`)

## Example dialogue

> **Dev:** "If I open two **Threads** in the business **Channel**, do they see each other's history?"
> **Domain expert:** "No — separate transcripts. But they share the Channel's memory, so a fact one
> Thread writes to memory is visible to the other."

## Flagged ambiguities

- "session" was used for three things — the **tmux session**, the **Claude session** (transcript),
  and the **WebSocket connection**. Resolved: "session" is demoted to an implementation word and
  always qualified ("tmux session" / "Claude session"); the domain terms are **Thread** (the
  conversation) and **Attachment** (the live pipe). tmux is an implementation detail, not a domain term.
