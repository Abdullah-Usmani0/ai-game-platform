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
const game = (state.games ?? []).find((g) => g.headVersionId);
if (!game) throw new Error(`no playable game in ${storeDir}; run pnpm demo first`);
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
  // 3. The new game's workspace shows the queued job.
  await page.goto(`${url}/games/${createdJson.gameId}?job=${createdJson.jobId}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="no-preview"]', { timeout: 10000 });
  await page.waitForSelector('[data-testid="job-status"]:has-text("queued")', { timeout: 10000 });
  const wantPanels = process.env.GG_EXPECT_PANELS === '1';
  ok = created.status === 201 && result.jobStatus === 'queued' && result.tick > 30 && errors.length === 0 && (!wantPanels || (result.panels && result.styleEditor));
  console.log(JSON.stringify({ ok, ...result, errors }, null, 2));
} catch (e) {
  console.error('check-create failed:', e.message, JSON.stringify(result));
  console.error(serverOut.slice(-3000));
} finally {
  await browser.close();
  stop();
}
process.exit(ok ? 0 : 1);
