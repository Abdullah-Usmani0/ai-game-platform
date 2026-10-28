import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from '@gg/db';

/**
 * Playbook candidates: every stage that failed its gate at least once and then passed. The failing checks and
 * the passing attempt's own summary are the raw material; a frontier model or a human writes the one-line
 * lesson, and `promote` appends it to the genre's playbook with its source. The cheap model never writes
 * playbook entries for itself (self-authored knowledge measured negative).
 */
export interface PlaybookCandidate {
  id: string;
  jobId: string;
  gameId: string;
  genre: string;
  stage: string;
  failedAttempts: Array<{ attempt: number; model: string; failureMode: string | null; failing: Array<{ name: string; detail: string }> }>;
  passedAttempt: { attempt: number; model: string; summary: string };
}

interface GateObject {
  checks?: Array<{ name: string; passed: boolean; detail?: string }>;
  summary?: string;
  model?: string;
}

async function readGate(store: Store, path: string | null): Promise<GateObject | null> {
  if (!path) return null;
  const slash = path.indexOf('/');
  if (slash < 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(await store.getObject(path.slice(0, slash), path.slice(slash + 1)))) as GateObject;
  } catch {
    return null;
  }
}

/** Scan the games the store lists and pair failed attempts with the pass that followed. */
export async function extractCandidates(store: Store, opts: { limit?: number } = {}): Promise<PlaybookCandidate[]> {
  const out: PlaybookCandidate[] = [];
  const games = await store.listGames({ limit: opts.limit ?? 200 });
  for (const game of games) {
    for (const job of await store.listJobs(game.id)) {
      const trajectories = await store.listTrajectories(job.id);
      const byStage = new Map<string, typeof trajectories>();
      for (const t of trajectories) byStage.set(t.stage, [...(byStage.get(t.stage) ?? []), t]);
      for (const [stage, list] of byStage) {
        const sorted = [...list].sort((a, b) => a.attempt - b.attempt);
        const pass = sorted.find((t) => t.passed);
        const fails = sorted.filter((t) => !t.passed && (!pass || t.attempt < pass.attempt));
        if (!pass || fails.length === 0) continue;
        const failedAttempts = [];
        for (const f of fails) {
          const g = await readGate(store, f.gateReportPath);
          failedAttempts.push({ attempt: f.attempt, model: f.model, failureMode: f.failureMode, failing: (g?.checks ?? []).filter((c) => !c.passed).map((c) => ({ name: c.name, detail: (c.detail ?? '').slice(0, 400) })) });
        }
        const pg = await readGate(store, pass.gateReportPath);
        out.push({ id: `${job.id.slice(0, 8)}-${stage}`, jobId: job.id, gameId: game.id, genre: game.genre, stage, failedAttempts, passedAttempt: { attempt: pass.attempt, model: pass.model, summary: (pg?.summary ?? '').slice(0, 600) } });
      }
    }
  }
  return out;
}

export function writeCandidates(harnessDir: string, candidates: PlaybookCandidate[]): string {
  const dir = join(harnessDir, '.agents', 'skills', 'playbook');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'candidates.json');
  writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), candidates }, null, 2) + '\n');
  return file;
}

/** Append a verified lesson to the genre's playbook entries, citing its source trajectory. */
export function promote(harnessDir: string, genre: string, text: string, source: string): string {
  const dir = join(harnessDir, '.agents', 'skills', 'playbook', 'entries');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${genre}.md`);
  const line = `- ${text.trim().replace(/\s+/g, ' ')} (source: ${source})\n`;
  if (existsSync(file) && readFileSync(file, 'utf8').includes(line)) return file;
  appendFileSync(file, line);
  return file;
}
