// End-to-end check of the create flow against a store that already holds a finished dry-run game (made by `pnpm demo`):
// the API creates a game + job, the workspace page shows progress state, and the head version plays through the bridge.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const storeDir = process.env.GG_STORE_DIR ?? resolve(cwd, '../../.gg-store-demo');
const state = JSON.parse(readFileSync(resolve(storeDir, 'store.json'), 'utf8'));
// A playable game the default dev user owns (only owners edit), untouched by moderation, with no queued or running job
// (an earlier run's editor job leaves the workspace busy until a worker runs it).
const busy = new Set((state.jobs ?? []).filter((j) => j.status === 'queued' || j.status === 'running').map((j) => j.gameId));
const game = (state.games ?? []).find((g) => g.headVersionId && g.ownerId === 'local-dev' && g.state !== 'removed' && g.state !== 'suspended' && !busy.has(g.id));
if (!game) throw new Error(`no idle playable game in ${storeDir}; run pnpm demo first`);
const port = 3100 + Math.floor(Math.random() * 500);
const server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(port)], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GG_STORE_DIR: storeDir } });
let serverOut = '';
server.stdout.on('data', (d) => (serverOut += d));
server.stderr.on('data', (d) => (serverOut += d));
const stop = () => { try { server.kill('SIGTERM'); } catch {} };
process.on('exit', stop);
const url = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  try { const r = await fetch(url); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 300));
}
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let ok = false;
const result = {};
try {
  // 1. API: create a game and its job (queued; no worker runs here).
  const created = await fetch(`${url}/api/games`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'A check-create platformer with coins and a walker to stomp.', genre: 'platformer', scopeTier: 'small', dryRun: true }) });
  const createdJson = await created.json();
  result.created = { status: created.status, jobId: createdJson.jobId };
  const jobRes = await fetch(`${url}/api/jobs/${createdJson.jobId}`);
  result.jobStatus = (await jobRes.json()).job?.status;
  // 1b. Remix the finished game: a new playable game whose head shares the origin's bundle.
  const remixed = await fetch(`${url}/api/games/${game.id}/remix`, { method: 'POST' });
  const remixJson = await remixed.json();
  const remixView = await (await fetch(`${url}/api/games/${remixJson.gameId}`)).json();
  result.remix = { status: remixed.status, playable: remixView.game?.state, headShared: remixView.head?.bundlePath === (state.versions.find((v) => v.id === game.headVersionId)?.bundlePath) };
  // 2. Workspace of the finished game: evidence panel and a playable preview over the bridge.
  await page.goto(`${url}/games/${game.id}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="evidence"]', { timeout: 20000 });
  result.panels = Boolean(await page.$('[data-testid="param-panel"]'));
  result.styleEditor = Boolean(await page.$('[data-testid="style-editor"]'));
  await page.waitForSelector('[data-testid="status"]:has-text("ready")', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.click('[data-testid="request-state"]');
  await page.waitForSelector('[data-testid="state"]', { timeout: 5000 });
  const stateText = await page.textContent('[data-testid="state"]');
  result.tick = Number(/tick (\d+)/.exec(stateText ?? '')?.[1] ?? 0);
  result.jobStatusShown = await page.textContent('[data-testid="job-status"]');
  // 2b. Level editor: place a collectible on the spawn tile, run the in-page check (validator + solver bot), apply.
  // The edit is queued as an edit_content job carrying the authored level; no worker runs here.
  const editor = await page.waitForSelector('[data-testid="level-editor"][data-loaded="yes"]', { timeout: 20000 }).catch(() => null);
  result.editor = Boolean(editor);
  if (editor) {
    await page.waitForSelector('[data-testid="level-check"]:not([disabled])', { timeout: 20000 });
    const canvas = await page.$('[data-testid="level-canvas"]');
    const cell = Number(await canvas.getAttribute('data-cell'));
    const [sx, sy] = (await canvas.getAttribute('data-spawn')).split(',').map(Number);
    await page.selectOption('[data-testid="entity-type"]', 'coin');
    await page.click('[data-testid="tool-entity"]');
    await canvas.click({ position: { x: sx * cell + cell / 2, y: sy * cell + cell / 2 } });
    await page.click('[data-testid="level-check"]');
    await page.waitForSelector('[data-testid="level-report"]', { timeout: 60000 });
    result.editorCheck = await page.getAttribute('[data-testid="level-report"]', 'data-ok');
    await page.click('[data-testid="level-apply"]');
    await page.waitForSelector('[data-testid="job-status"]:has-text("queued")', { timeout: 15000 });
    const view = await (await fetch(`${url}/api/games/${game.id}`)).json();
    const editJob = view.jobs[0];
    result.editorJob = { kind: editJob?.kind, status: editJob?.status, levels: editJob?.input?.content?.levels?.map((l) => `${l.id}:${l.entities.length}`) };
  }
  // 3. The new game's workspace shows the queued job.
  await page.goto(`${url}/games/${createdJson.gameId}?job=${createdJson.jobId}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="no-preview"]', { timeout: 10000 });
  await page.waitForSelector('[data-testid="job-status"]:has-text("queued")', { timeout: 10000 });
  const wantPanels = process.env.GG_EXPECT_PANELS === '1';
  const editorOk = !wantPanels || (result.editor && result.editorCheck === 'yes' && result.editorJob?.kind === 'edit_content' && result.editorJob?.status === 'queued' && result.editorJob?.levels?.length === 1);
  ok = created.status === 201 && result.jobStatus === 'queued' && result.tick > 30 && errors.length === 0 && (!wantPanels || (result.panels && result.styleEditor)) && editorOk && result.remix.status === 201 && result.remix.playable === 'playable' && result.remix.headShared;
  console.log(JSON.stringify({ ok, ...result, errors }, null, 2));
} catch (e) {
  console.error('check-create failed:', e.message, JSON.stringify(result));
  console.error(serverOut.slice(-3000));
} finally {
  await browser.close();
  stop();
}
process.exit(ok ? 0 : 1);
