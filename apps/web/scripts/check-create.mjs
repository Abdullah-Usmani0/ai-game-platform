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
  // 2. Workspace of the finished game: evidence (the overview tab, open by default) and a playable preview over the bridge.
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
  if (await page.$('[data-testid="tab-levels"]')) await page.click('[data-testid="tab-levels"]');
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
  // 2c. Code view: the head's source opens in the workspace without the private concept, build output or reports, a
  // file shows its lines, and "Ask for a change" starts an edit about it.
  await page.click('[data-testid="tab-code"]');
  await page.click('[data-testid="code-open"]');
  await page.waitForSelector('[data-testid="code-loaded"]', { timeout: 20000 });
  const files = await page.$$eval('[data-testid="code-file"]', (els) => els.map((e) => e.getAttribute('data-path')));
  await page.click('[data-testid="code-file"][data-path="src/game.ts"]');
  await page.waitForSelector('[data-testid="code-path"]:has-text("src/game.ts")', { timeout: 5000 });
  const codeLines = await page.$$eval('[data-testid="code-text"] .line', (els) => els.length);
  await page.click('[data-testid="code-ask"]');
  result.code = { files: files.length, game: files.includes('src/game.ts'), lines: codeLines, asked: await page.inputValue('[data-testid="edit-message"]'), leaks: files.filter((f) => f === 'design/concept.md' || /^(bundle|reports)\//.test(f)) };
  // The demo's level-editor edit: its head marks the edited level as changed against the version it was built on.
  const edited = (state.games ?? []).find((g) => {
    const v = (state.versions ?? []).find((x) => x.id === g.headVersionId);
    return g.ownerId === 'local-dev' && (state.jobs ?? []).find((j) => j.id === v?.jobId)?.kind === 'edit_content';
  });
  if (edited) {
    const src = await (await fetch(`${url}/api/games/${edited.id}/source`)).json();
    const level = src.files?.find((f) => f.path.startsWith('content/levels/') && f.status === 'changed');
    result.code.edit = { previous: src.previous?.number ?? null, level: level?.path ?? null, added: level?.diff?.filter((d) => d.op === '+').length ?? 0, unchanged: src.files?.filter((f) => f.status === 'same').length ?? 0 };
  }
  // 2d. The demo's freeform game: its play page names the genre it builds on and lists the keys its own systems use.
  const ffGame = (state.games ?? []).find((g) => g.genre === 'freeform' && g.headVersionId && g.state !== 'removed' && g.state !== 'suspended');
  if (ffGame) {
    await page.goto(`${url}/play/${ffGame.id}?mode=preview`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('[data-testid="controls"]', { timeout: 20000 });
    result.freeformPlay = { pill: (await page.textContent('.play-info .pill'))?.trim(), keys: await page.$$eval('[data-testid="controls"] kbd', (els) => els.map((e) => e.textContent)) };
  }
  // 3. The new game's workspace shows the queued job.
  await page.goto(`${url}/games/${createdJson.gameId}?job=${createdJson.jobId}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="no-preview"]', { timeout: 10000 });
  await page.waitForSelector('[data-testid="job-status"]:has-text("queued")', { timeout: 10000 });
  // 3b. "Anything else": a freeform idea through the API; its workspace lists the freeform plan (the cast named after
  // the systems, the winning runs recorded again after the code).
  const ff = await fetch(`${url}/api/games`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'A moth carrying lanterns home through a night forest: collect them on the way, and mind the frogs.', genre: 'freeform', scopeTier: 'small', dryRun: true }) });
  const ffJson = await ff.json();
  await page.goto(`${url}/games/${ffJson.gameId}?job=${ffJson.jobId}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="job-status"]:has-text("queued")', { timeout: 10000 });
  result.freeform = { status: ff.status, pill: await page.textContent('[data-testid="genre-pill"]'), stages: await page.$$eval('ol.stages li', (els) => els.map((e) => e.getAttribute('data-stage'))) };
  // 4. Training consent on the create page: on by default; unchecking opts the player out (the API reports it, and the
  // store deletes their recorded pairs), checking it again opts back in.
  await fetch(`${url}/api/me/training`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ optOut: false }) });
  await page.goto(`${url}/create`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('[data-testid="training-consent"][data-opt-out="false"]', { timeout: 10000 });
  // The "Anything else" card offers freeform ideas to start from.
  await page.click('[data-genre="freeform"]');
  result.freeformCard = await page.$$eval('.suggestion', (els) => els.map((e) => e.getAttribute('title') ?? '').filter((t) => /lanterns home/.test(t)).length);
  await page.click('[data-testid="training-consent-box"]');
  await page.waitForSelector('[data-testid="training-consent"][data-opt-out="true"]', { timeout: 10000 });
  const optedOut = (await (await fetch(`${url}/api/me`)).json()).trainingOptOut;
  await page.click('[data-testid="training-consent-box"]');
  await page.waitForSelector('[data-testid="training-consent"][data-opt-out="false"]', { timeout: 10000 });
  result.training = { optedOut, optedBackIn: (await (await fetch(`${url}/api/me`)).json()).trainingOptOut === false };
  const wantPanels = process.env.GG_EXPECT_PANELS === '1';
  const editorOk = !wantPanels || (result.editor && result.editorCheck === 'yes' && result.editorJob?.kind === 'edit_content' && result.editorJob?.status === 'queued' && result.editorJob?.levels?.length === 1);
  const ffStages = result.freeform?.stages ?? [];
  const freeformOk = result.freeformPlay?.pill === 'Freeform · Precision platformer' && result.freeformPlay.keys.includes('Z / Space') && result.freeform?.status === 201 && result.freeform.pill === 'Freeform' && ffStages.slice(0, 5).join(',') === 'gdd,systems,composition,sprites,scaffold' && ffStages[ffStages.indexOf('implement') + 1] === 'prove' && result.freeformCard === 1;
  ok = freeformOk && created.status === 201 && result.jobStatus === 'queued' && result.tick > 30 && errors.length === 0 && (!wantPanels || (result.panels && result.styleEditor)) && editorOk && result.remix.status === 201 && result.remix.playable === 'playable' && result.remix.headShared && result.training.optedOut === true && result.training.optedBackIn && result.code.game && result.code.lines > 5 && result.code.leaks.length === 0 && result.code.asked === 'In src/game.ts: ' && Boolean(result.code.edit && result.code.edit.previous !== null && result.code.edit.level !== null && result.code.edit.added > 0 && result.code.edit.unchanged > 0);
  console.log(JSON.stringify({ ok, ...result, errors }, null, 2));
} catch (e) {
  console.error('check-create failed:', e.message, JSON.stringify(result));
  console.error(serverOut.slice(-3000));
} finally {
  await browser.close();
  stop();
}
process.exit(ok ? 0 : 1);
