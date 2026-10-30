import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JobRow, LevelProofRow, Store } from '@gg/db';
import { LevelProof } from '@gg/schemas';
import { hasBespokeSystems, readGameLevels, replayRun } from '@gg/templates/node';
import { materialize } from './materialize.js';

export interface VerifyProofOptions {
  store: Store;
  job: JobRow;
  templateDir: string;
  workRoot: string;
  log?: (line: string) => void;
}

/**
 * Whether a player's run wins its level on the game as it was played: replayed on the restored version as the gate
 * replays recorded runs (in Node; with the game's own test, which replays every run in content/proofs, when the game
 * has systems of its own). The verdict names what is wrong with a run that does not count.
 */
export async function judgeProof(row: LevelProofRow, gameDir: string): Promise<{ accepted: boolean; reason?: string }> {
  const parsed = LevelProof.safeParse(row.proof);
  if (!parsed.success) return { accepted: false, reason: `not a recorded run: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'run'}: ${i.message}`).join('; ')}` };
  const proof = parsed.data;
  if (proof.level !== row.level) return { accepted: false, reason: `the run is of ${proof.level}, not ${row.level}` };
  if (proof.by !== 'human') return { accepted: false, reason: `a player's run is by 'human', not '${proof.by}'` };
  const slot = readGameLevels(gameDir).find((l) => l.level.id === row.level);
  if (!slot) return { accepted: false, reason: `the version has no level ${row.level}` };
  if (proof.seed !== slot.seed) return { accepted: false, reason: `the run was recorded at seed ${proof.seed}; the game plays ${row.level} at ${slot.seed}` };
  const dir = join(gameDir, 'content', 'proofs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${row.level}.json`), JSON.stringify(proof) + '\n');
  if (hasBespokeSystems(gameDir)) {
    // The game's own code plays its levels: its test replays every recorded run, this one included.
    const r = spawnSync('pnpm', ['exec', 'vitest', 'run', 'tests/unit/game.test.ts'], { cwd: gameDir, encoding: 'utf8', env: { ...process.env, CI: '1' }, maxBuffer: 16 * 1024 * 1024 });
    if (r.status === 0) return { accepted: true };
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    return { accepted: false, reason: out.includes(`level ${row.level} not completed`) ? `${row.level} is not won when the run is replayed` : `the game's test did not pass with the run: ${out.trim().split('\n').slice(-6).join(' / ')}` };
  }
  const end = replayRun(gameDir, proof);
  if (!end) return { accepted: false, reason: `${row.level} is not a level that waits for a player's run` };
  if (end.won) return { accepted: true };
  return { accepted: false, reason: `${row.level} is not won when the run is replayed: ${end.lost ? 'the player loses on the way' : `after ${proof.ticks} ticks the level is still being played`}` };
}

/**
 * Job kind verify_proof: a player's winning run on a level that waited for one, replayed on the version it was played
 * on. A run that wins proves the level (the version names it, and the game can be listed once no level waits); one
 * that does not is kept with the reason. Either way the job succeeds: it did its work.
 */
export async function verifyProof(opts: VerifyProofOptions): Promise<'succeeded' | 'failed'> {
  const { store, job, log = () => {} } = opts;
  const finish = async (status: 'succeeded' | 'failed', payload: Record<string, unknown>, error?: { stage: string; reason: string }) => {
    await store.updateJob(job.id, { status, stage: 'verify', finishedAt: new Date().toISOString(), ...(error ? { error } : {}) });
    await store.appendEvent(job.id, 'finished', { status, ...payload }, 'verify');
    return status;
  };
  const proofId = String(job.input['proofId'] ?? '');
  const row = await store.getProof(proofId);
  if (!row) return finish('failed', {}, { stage: 'verify', reason: `proof ${proofId} not found` });
  if (row.status !== 'pending') return finish('succeeded', { proofId, level: row.level, note: `the run was ${row.status} already` });
  const version = await store.getVersion(row.versionId);
  if (!version?.sourcePath) return finish('failed', { proofId }, { stage: 'verify', reason: `version ${row.versionId} has no checkpoint` });
  await store.updateJob(job.id, { stage: 'verify' });
  await store.appendEvent(job.id, 'stage_started', { attempt: 1, level: row.level }, 'verify');
  const slash = version.sourcePath.indexOf('/');
  const tgz = await store.getObject(version.sourcePath.slice(0, slash), version.sourcePath.slice(slash + 1));
  const { gameDir } = materialize({ templateDir: opts.templateDir, workDir: join(opts.workRoot, job.id), checkpoint: tgz });
  const verdict = await judgeProof(row, gameDir);
  const resolved = await store.resolveProof(row.id, verdict);
  log(`proof ${row.id} on ${row.level}: ${resolved.status}${resolved.reason ? ` (${resolved.reason})` : ''}`);
  // The workspace's job panel shows the replay as a stage: passed with what it proved, or failed with the reason.
  if (resolved.status === 'accepted') {
    await store.appendEvent(job.id, 'gate_passed', { level: row.level }, 'verify');
    await store.appendEvent(job.id, 'assistant_summary', { summary: `${row.level} is won when the run is replayed: a player proved it` }, 'verify');
  } else {
    await store.appendEvent(job.id, 'gate_failed', { level: row.level, failing: [resolved.reason ?? `${row.level} is not won when the run is replayed`] }, 'verify');
  }
  return finish('succeeded', { proofId: row.id, level: row.level, verdict: resolved.status, reason: resolved.reason });
}

/**
 * The players' runs that proved levels of a version after it was checkpointed (or of the original a remix's first
 * version copies), written into the game an edit starts from: its stages replay them like any recorded run, so a level
 * a player proved stays proven unless the edit stops the run winning. Returns the levels restored.
 */
export async function restorePlayerRuns(store: Store, versionId: string, gameDir: string): Promise<string[]> {
  const restored: string[] = [];
  let id: string | null = versionId;
  for (let hops = 0; id && hops < 8; hops++) {
    for (const p of await store.listProofs(id)) {
      const file = join(gameDir, 'content', 'proofs', `${p.level}.json`);
      if (p.status !== 'accepted' || existsSync(file)) continue;
      mkdirSync(join(gameDir, 'content', 'proofs'), { recursive: true });
      writeFileSync(file, JSON.stringify(p.proof) + '\n');
      restored.push(p.level);
    }
    const v: Awaited<ReturnType<Store['getVersion']>> = await store.getVersion(id);
    id = v?.stage === 'remix' ? v.parentVersionId : null;
  }
  return restored;
}
