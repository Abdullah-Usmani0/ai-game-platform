// Regenerates public/genres/<genre>.png: one frame of each built sample game at its own resolution, for the create
// page's genre cards and the front page, and freeform.png from the lantern moth, a freeform example game the scaffold
// builds as the worker would. Build the samples first (`pnpm build`).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
// The tick each frame is taken at: late enough for the level banner to be gone and something to be happening. A sample
// that keeps a recorded run of its first level (content/proofs) plays it to that tick: a farm's sixth morning, the field green.
const FRAMES = { platformer: 230, survivors: 420, 'topdown-action': 200, shmup: 330, metroidvania: 200, puzzle: 170, lifesim: 5300 };
let failed = 0;
for (const [genre, tick] of Object.entries(FRAMES)) {
  const proofs = `${root}/samples/${genre}/content/proofs`;
  const proof = existsSync(proofs) ? readdirSync(proofs).filter((f) => f.endsWith('.json')).sort()[0] : undefined;
  const args = ['--import', 'tsx', 'src/cli.ts', 'still', `${root}/samples/${genre}/dist`, '--seed', '1', '--tick', String(tick), '--out', `${root}/apps/web/public/genres/${genre}.png`, ...(proof ? ['--script', `${proofs}/${proof}`] : [])];
  const r = spawnSync('node', args, { cwd: `${root}/packages/bots`, stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
// "Anything else": the lantern moth's first level by its recorded winning run, lanterns lit, past the level banner.
const game = mkdtempSync(join(tmpdir(), 'gg-preview-freeform-'));
const steps = [
  ['node', ['--import', 'tsx', 'src/cli.ts', '--example', 'lantern', '--out', game, '--seed', '1'], `${root}/tools/scaffold`],
  ['pnpm', ['run', 'build'], game],
  ['node', ['--import', 'tsx', 'src/cli.ts', 'still', `${game}/dist`, '--seed', '1', '--tick', '150', '--out', `${root}/apps/web/public/genres/freeform.png`, '--script', `${game}/content/proofs/l01.json`], `${root}/packages/bots`],
];
for (const [cmd, args, cwd] of steps) {
  if (spawnSync(cmd, args, { cwd, stdio: 'inherit' }).status !== 0) {
    failed++;
    break;
  }
}
rmSync(game, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
