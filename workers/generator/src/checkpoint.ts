import { spawnSync } from 'node:child_process';
import type { Store } from '@gg/db';

/** Tar the game directory (minus node_modules, dist and screenshots) into the checkpoints bucket. */
export async function checkpoint(store: Store, gameDir: string, gameId: string, jobId: string, stage: string): Promise<{ path: string; bytes: number }> {
  const r = spawnSync('tar', ['-czf', '-', '-C', gameDir, '--exclude=node_modules', '--exclude=dist', '--exclude=reports/screenshots', '--dereference', '.'], { maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr?.toString().slice(0, 500)}`);
  const bytes = new Uint8Array(r.stdout);
  const path = await store.putObject('checkpoints', `g/${gameId}/j/${jobId}/${stage}.tgz`, bytes, 'application/gzip');
  return { path, bytes: bytes.length };
}
