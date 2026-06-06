#!/usr/bin/env node
/**
 * edupudi Channel Skill usage logger (ADR-0005).
 *
 * Invoked as a Claude Code `PreToolUse` hook matching the `Skill` tool. Claude pipes the hook
 * payload as JSON on stdin; we extract `tool_input.skill` (the skill name) and `cwd` (the Channel
 * directory) and append one `{ skill, ts }` line to `<cwd>/.claude/skill-usage.jsonl`.
 *
 * APPEND-ONLY (ADR-0005): multiple Threads in a Channel can invoke skills concurrently (ADR-0003),
 * so we never read-modify-write the ledger — a single `fs.appendFileSync` (O_APPEND) keeps each
 * line atomic and avoids the lost-update race. The hook must never block or fail a skill
 * invocation, so any error is swallowed (logged to stderr) and we always exit 0.
 *
 * This records ALL skill invocations, including built-in skills; the Garden pass (a separate issue)
 * filters to skills that exist under `.claude/skills/`, so built-ins are recorded but never pruned.
 */
import fs from 'node:fs';
import path from 'node:path';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buf += chunk;
    });
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', () => resolve(buf));
  });
}

interface SkillHookPayload {
  cwd?: string;
  tool_input?: { skill?: string };
}

async function main(): Promise<void> {
  try {
    const raw = await readStdin();
    if (!raw.trim()) return;

    const payload = JSON.parse(raw) as SkillHookPayload;
    const skill = payload.tool_input?.skill;
    const cwd = payload.cwd;
    if (!skill || !cwd) return;

    const ledgerDir = path.join(cwd, '.claude');
    fs.mkdirSync(ledgerDir, { recursive: true });
    const line = JSON.stringify({ skill, ts: Date.now() }) + '\n';
    // Append-only: O_APPEND makes each write land at end-of-file atomically (ADR-0005).
    fs.appendFileSync(path.join(ledgerDir, 'skill-usage.jsonl'), line);
  } catch (err) {
    // Never fail a skill invocation because logging hiccupped.
    process.stderr.write(`[skill-logger] ${(err as Error).message}\n`);
  }
}

void main();
