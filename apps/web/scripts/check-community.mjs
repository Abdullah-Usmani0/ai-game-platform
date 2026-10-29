// End-to-end check of the community layer against a store holding a finished dry-run game (made by `pnpm demo`):
// the owner publishes it, a player plays (the session is recorded on pagehide) and rates it, the feed ranks it, the owner
// asks for a tester, and a tester claims the game, plays 30 s, reports and is paid. Identities are the dev cookie.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const storeDir = process.env.GG_STORE_DIR ?? resolve(cwd, '../../.gg-store-demo');
const state = JSON.parse(readFileSync(resolve(storeDir, 'store.json'), 'utf8'));
const game = (state.games ?? []).find((g) => g.headVersionId && g.ownerId === 'local-dev' && !g.originVersionId);
if (!game) throw new Error(`no playable game owned by local-dev in ${storeDir}; run pnpm demo first`);
const port = 3600 + Math.floor(Math.random() * 300);
const server = spawn('pnpm', ['exec', 'next', 'start', '-p', String(port)], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GG_STORE_DIR: storeDir } });
let serverOut = '';
server.stdout.on('data', (d) => (serverOut += d));
server.stderr.on('data', (d) => (serverOut += d));
const stop = () => {
  try {
    server.kill('SIGTERM');
  } catch {}
};
process.on('exit', stop);
const url = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 60000;
while (Date.now() < deadline) {
  try {
    const r = await fetch(url);
    if (r.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 300));
}
const as = (user) => ({ cookie: `gg-user=${user}`, 'content-type': 'application/json' });
const api = async (path, user, body) => {
  const r = await fetch(`${url}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: as(user), body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const pageAs = async (user) => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: 'gg-user', value: user, url }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
};
let ok = false;
const result = {};
try {
  // 1. The owner publishes the game from the workspace panel; a non-owner may not.
  result.strangerPublish = (await api(`/api/games/${game.id}/publish`, 'player-a', { listed: true })).status;
  const owner = await pageAs('local-dev');
  await owner.goto(`${url}/games/${game.id}`, { waitUntil: 'load', timeout: 30000 });
  await owner.waitForSelector('[data-testid="community"]', { timeout: 20000 });
  if ((await owner.getAttribute('[data-testid="community"]', 'data-listed')) !== 'yes') await owner.click('[data-testid="publish"]');
  await owner.waitForSelector('[data-testid="community"][data-listed="yes"]', { timeout: 15000 });
  result.listed = true;

  // 2. A player opens it from the feed, plays a few seconds, rates it; leaving the page records the session.
  const player = await pageAs('player-a');
  await player.goto(`${url}/`, { waitUntil: 'load', timeout: 30000 });
  await player.waitForSelector(`[data-testid="feed-item"][data-game="${game.id}"]`, { timeout: 15000 });
  await player.click(`[data-testid="feed-item"][data-game="${game.id}"] a >> nth=1`);
  await player.waitForSelector('[data-testid="status"]:has-text("ready")', { timeout: 30000 });
  await player.waitForTimeout(3000);
  await player.click('[data-testid="rate-fun"]');
  await player.waitForSelector('[data-testid="rated"]:has-text("fun")', { timeout: 10000 });
  await player.goto(`${url}/games`, { waitUntil: 'load' });
  let stats = null;
  for (let i = 0; i < 20 && !(stats?.players >= 1); i++) {
    stats = (await api(`/api/games/${game.id}/community`, 'local-dev')).json.stats;
    if (!(stats?.players >= 1)) await new Promise((r) => setTimeout(r, 250));
  }
  result.afterPlay = { players: stats?.players, ratings: stats?.ratingCount, fun: stats?.ratings?.fun };

  // 3. Two more players report sessions through the API; the feed ranks the game with their signals.
  await api('/api/plays', 'player-b', { gameId: game.id, versionId: game.headVersionId, source: 'feed', durationS: 95, completed: true, levelsCompleted: 1, deaths: 2 });
  await api('/api/plays', 'player-c', { gameId: game.id, versionId: game.headVersionId, source: 'feed', durationS: 40, completed: false, levelsCompleted: 0, deaths: 4 });
  const feed = (await api('/api/feed', 'player-a')).json.items ?? [];
  const item = feed.find((f) => f.id === game.id);
  result.feed = { position: feed.findIndex((f) => f.id === game.id), players: item?.stats.players, qualified: item?.stats.qualifiedPlayers, rank: item?.stats.rankScore };

  // 4. The owner asks for one tester; the tester claims it, plays 30 s, reports and is paid.
  const ask = await api(`/api/games/${game.id}/tests`, 'local-dev', { needed: 1, rewardCredits: 5 });
  result.ask = ask.status;
  const creditsBefore = (await api('/api/me', 'tester-1')).json.credits ?? 0;
  const tester = await pageAs('tester-1');
  await tester.goto(`${url}/test`, { waitUntil: 'load', timeout: 30000 });
  await tester.click('[data-testid="claim-test"]');
  await tester.waitForSelector('[data-testid="status"]:has-text("ready")', { timeout: 30000 });
  await tester.waitForSelector('[data-testid="submit-test"]:not([disabled])', { timeout: 45000 });
  await tester.click('[data-testid="verdict-works"]');
  await tester.selectOption('[data-testid="test-tag"]', 'fun');
  await tester.click('[data-testid="submit-test"]');
  await tester.waitForSelector('[data-testid="test-message"]:has-text("credits paid")', { timeout: 15000 });
  result.testerPaid = ((await api('/api/me', 'tester-1')).json.credits ?? 0) - creditsBefore;
  const community = (await api(`/api/games/${game.id}/community`, 'local-dev')).json;
  const round = community.tests?.[community.tests.length - 1];
  result.round = { status: round?.status, outcome: round?.outcome, tested: community.tested?.outcome };

  ok =
    result.strangerPublish === 403 &&
    result.listed &&
    result.afterPlay.players >= 1 &&
    result.afterPlay.fun >= 1 &&
    result.feed.position >= 0 &&
    result.feed.qualified >= 2 &&
    result.ask === 201 &&
    result.testerPaid === 5 &&
    result.round.status === 'closed' &&
    result.round.outcome === 'works' &&
    errors.length === 0;
  console.log(JSON.stringify({ ok, ...result, errors }, null, 2));
} catch (e) {
  console.error('check-community failed:', e.message, JSON.stringify(result));
  console.error(serverOut.slice(-3000));
} finally {
  await browser.close();
  stop();
}
process.exit(ok ? 0 : 1);
