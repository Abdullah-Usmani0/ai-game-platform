import { hostname } from 'node:os';
import type { Store } from '@gg/db';
import { runJob } from './job-runner.js';

export interface WorkerOptions {
  store: Store;
  templateDir: string;
  workRoot: string;
  once?: boolean;
  pollMs?: number;
  log?: (line: string) => void;
}

/** Claim loop: claim a queued job, run it, repeat. `once` processes at most one job (CI and demo). */
export async function workerLoop(opts: WorkerOptions): Promise<number> {
  const workerId = `${hostname()}:${process.pid}`;
  const log = opts.log ?? ((l: string) => console.log(`[worker ${workerId}] ${l}`));
  let processed = 0;
  for (;;) {
    const job = await opts.store.claimJob(workerId);
    if (!job) {
      if (opts.once) return processed;
      await new Promise((r) => setTimeout(r, opts.pollMs ?? 2000));
      continue;
    }
    log(`claimed job ${job.id} (${job.kind}) for game ${job.gameId}`);
    try {
      const status = await runJob({ store: opts.store, job, templateDir: opts.templateDir, workRoot: opts.workRoot, workerId, log });
      log(`job ${job.id} ${status}`);
    } catch (e) {
      log(`job ${job.id} crashed: ${(e as Error).message}`);
      await opts.store.updateJob(job.id, { status: 'failed', error: { message: (e as Error).message }, finishedAt: new Date().toISOString() });
      await opts.store.appendEvent(job.id, 'finished', { status: 'failed', error: (e as Error).message });
    }
    processed++;
    if (opts.once) return processed;
  }
}
