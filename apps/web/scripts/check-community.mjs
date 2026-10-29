// End-to-end check of the community layer against a store holding a finished dry-run game (made by `pnpm demo`):
// the owner publishes it, a player plays (the session is recorded on pagehide) and rates it, the feed ranks it, the owner
// asks for a tester, and a tester claims the game, plays 30 s, reports and is paid. The owner's heatmap shows the
// player's position samples and quit point and two players' deaths, in the API and over the level editor. Then moderation: three players'
// reports suspend the game and a moderator's dismissals in the queue bring it back; a fan's remix is taken down for ip
// and the fan gets a strike. Identities are the dev cookie ('moderator' is the file store's moderator).
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
  // A run that stopped midway can leave reports open on the game (and the game suspended).
  for (const r of (await api('/api/reports?status=open', 'moderator')).json.reports ?? []) {
    if (r.gameId === game.id) await api(`/api/reports/${r.id}/resolve`, 'moderator', { resolution: 'dismiss', note: 'check-community reset' });
  }

  // 1. The owner publishes the game from the workspace panel; a non-owner may not.
  result.strangerPublish = (await api(`/api/games/${game.id}/publish`, 'player-a', { listed: true })).status;
  const owner = await pageAs('local-dev');
  await owner.goto(`${url}/games/${game.id}`, { waitUntil: 'load', timeout: 30000 });
  await owner.waitForSelector('[data-testid="community"]', { timeout: 20000 });
  if ((await owner.getAttribute('[data-testid="community"]', 'data-listed')) !== 'yes') await owner.click('[data-testid="publish"]');
  await owner.waitForSelector('[data-testid="community"][data-listed="yes"]', { timeout: 15000 });
  result.listed = true;

  // Heat totals per kind, overall and per level of the head, from the owner's heatmap API (the store keeps earlier
  // runs' plays, so the check compares before and after).
  const heatTotals = async () => {
    const heat = (await api(`/api/games/${game.id}/heatmap`, 'local-dev')).json;
    const t = { levels: Object.keys(heat.levels ?? {}), death: 0, quit: 0, sample: 0, byLevel: {} };
    for (const [id, lv] of Object.entries(heat.levels ?? {})) {
      const sum = (k) => lv[k].reduce((n, c) => n + c.n, 0);
      t.byLevel[id] = { deaths: sum('death'), quits: sum('quit'), samples: sum('sample') };
      t.death += t.byLevel[id].deaths;
      t.quit += t.byLevel[id].quits;
      t.sample += t.byLevel[id].samples;
    }
    return t;
  };
  const heatBefore = await heatTotals();

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
  const heatAfterPlay = await heatTotals();
  const level = heatAfterPlay.levels[0];

  // 3. Two more players report sessions through the API; the feed ranks the game with their signals.
  const death = (x, y, t) => ({ kind: 'death', level, x, y, t });
  await api('/api/plays', 'player-b', { gameId: game.id, versionId: game.headVersionId, source: 'feed', durationS: 95, completed: true, levelsCompleted: 1, deaths: 2, events: [death(40, 40, 10), death(41, 44, 20)] });
  await api('/api/plays', 'player-c', { gameId: game.id, versionId: game.headVersionId, source: 'feed', durationS: 40, completed: false, levelsCompleted: 0, deaths: 4, events: [death(40, 40, 5)] });
  const feed = (await api('/api/feed', 'player-a')).json.items ?? [];
  const item = feed.find((f) => f.id === game.id);
  result.feed = { position: feed.findIndex((f) => f.id === game.id), players: item?.stats.players, qualified: item?.stats.qualifiedPlayers, rank: item?.stats.rankScore };

  // 3b. The owner's heatmap: the browser session sent samples and its quit point; the API plays sent three deaths. The
  //     level editor draws the same counts over the first level; other players do not see it.
  const heatAfter = await heatTotals();
  await owner.goto(`${url}/games/${game.id}`, { waitUntil: 'load', timeout: 30000 });
  await owner.waitForSelector('[data-testid="level-editor"][data-loaded="yes"]', { timeout: 20000 });
  await owner.click('[data-testid="heat-toggle"]');
  await owner.waitForSelector('[data-testid="level-canvas"][data-heat="on"]', { timeout: 10000 });
  const canvasHeat = async (name) => Number(await owner.getAttribute('[data-testid="level-canvas"]', `data-heat-${name}`));
  result.heat = {
    level,
    samples: heatAfterPlay.sample - heatBefore.sample,
    quits: heatAfterPlay.quit - heatBefore.quit,
    deaths: heatAfter.death - heatAfterPlay.death,
    canvas: { deaths: await canvasHeat('deaths'), quits: await canvasHeat('quits'), samples: await canvasHeat('samples') },
    api: heatAfter.byLevel[await owner.inputValue('[data-testid="level-select"]')] ?? null,
    legend: await owner.textContent('[data-testid="heat-legend"]'),
    stranger: (await api(`/api/games/${game.id}/heatmap`, 'player-a')).status,
  };

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

  // 5. Three players report the game (one through the play page form); the third report suspends it: out of the feed,
  //    hidden from other players, no remixes. The moderator dismisses the reports in the queue and it comes back.
  const reporter = await pageAs('player-a');
  await reporter.goto(`${url}/play/${game.id}?src=direct`, { waitUntil: 'load', timeout: 30000 });
  await reporter.click('[data-testid="report-open"]');
  await reporter.click('[data-testid="report-abuse"]');
  await reporter.fill('[data-testid="report"] textarea', 'check-community: abusive title');
  await reporter.click('[data-testid="report-send"]');
  await reporter.waitForSelector('[data-testid="report-done"]', { timeout: 10000 });
  await api(`/api/games/${game.id}/report`, 'player-b', { kind: 'abuse', note: 'same here' });
  const third = await api(`/api/games/${game.id}/report`, 'player-c', { kind: 'broken', note: 'crashes on level 1' });
  const visitor = await pageAs('player-d');
  await visitor.goto(`${url}/play/${game.id}`, { waitUntil: 'load', timeout: 30000 });
  result.suspension = {
    suspended: third.json.suspended,
    inFeed: ((await api('/api/feed', 'player-d')).json.items ?? []).some((f) => f.id === game.id),
    visitorSees: await visitor.getAttribute('[data-testid="moderated"]', 'data-state'),
    remix: (await api(`/api/games/${game.id}/remix`, 'player-d', {})).status,
    strangerQueue: (await api('/api/reports?status=open', 'player-d')).status,
  };
  const mod = await pageAs('moderator');
  await mod.goto(`${url}/moderation`, { waitUntil: 'load', timeout: 30000 });
  const group = `[data-testid="moderation-game"][data-game="${game.id}"]`;
  const reportsIn = `${group} [data-testid="moderation-report"]`;
  await mod.waitForSelector(group, { timeout: 15000 });
  result.suspension.queued = await mod.locator(reportsIn).count();
  for (let left = result.suspension.queued - 1; left >= 0; left--) {
    await mod.locator(`${group} [data-testid="resolve-dismiss"]`).first().click();
    await mod.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length === n, [reportsIn, left], { timeout: 10000 });
  }
  result.suspension.after = (await api(`/api/games/${game.id}/community`, 'local-dev')).json.state;
  result.suspension.backInFeed = ((await api('/api/feed', 'player-d')).json.items ?? []).some((f) => f.id === game.id);

  // 6. A fan remixes the game, a rights holder reports the remix, and the moderator removes it from the queue with a
  //    note: players see it removed, it cannot be remixed, its owner sees why and has a strike; the original stays up.
  const fan = `fan-${Date.now().toString(36)}`;
  const remix = (await api(`/api/games/${game.id}/remix`, fan, {})).json;
  await api(`/api/games/${remix.gameId}/report`, 'player-a', { kind: 'ip', note: 'my sprites', rightsHolder: true });
  await mod.goto(`${url}/moderation`, { waitUntil: 'load', timeout: 30000 });
  const remixGroup = `[data-testid="moderation-game"][data-game="${remix.gameId}"]`;
  await mod.waitForSelector(remixGroup, { timeout: 15000 });
  await mod.fill(`${remixGroup} input[aria-label="decision note"]`, 'check-community takedown');
  await mod.click(`${remixGroup} [data-testid="resolve-remove"]`);
  await mod.waitForSelector(remixGroup, { state: 'detached', timeout: 10000 });
  await visitor.goto(`${url}/play/${remix.gameId}`, { waitUntil: 'load', timeout: 30000 });
  result.takedown = {
    visitorSees: await visitor.getAttribute('[data-testid="moderated"]', 'data-state'),
    remix: (await api(`/api/games/${remix.gameId}/remix`, 'player-d', {})).status,
    removedFor: (await api(`/api/games/${remix.gameId}/community`, fan)).json.moderation?.removedFor,
    fanStrikes: (await api('/api/me', fan)).json.strikes,
    original: (await api(`/api/games/${game.id}/community`, 'local-dev')).json.state,
  };

  ok =
    result.strangerPublish === 403 &&
    result.listed &&
    result.afterPlay.players >= 1 &&
    result.afterPlay.fun >= 1 &&
    result.feed.position >= 0 &&
    result.feed.qualified >= 2 &&
    result.heat.level !== undefined &&
    result.heat.samples >= 1 &&
    result.heat.quits === 1 &&
    result.heat.deaths === 3 &&
    result.heat.api !== null &&
    result.heat.canvas.deaths === result.heat.api.deaths &&
    result.heat.canvas.quits === result.heat.api.quits &&
    result.heat.canvas.samples === result.heat.api.samples &&
    /play\(s\) reached this level/.test(result.heat.legend ?? '') &&
    result.heat.stranger === 403 &&
    result.ask === 201 &&
    result.testerPaid === 5 &&
    result.round.status === 'closed' &&
    result.round.outcome === 'works' &&
    result.suspension.suspended === true &&
    result.suspension.inFeed === false &&
    result.suspension.visitorSees === 'suspended' &&
    result.suspension.remix === 409 &&
    result.suspension.strangerQueue === 403 &&
    result.suspension.queued === 3 &&
    result.suspension.after === 'published' &&
    result.suspension.backInFeed === true &&
    result.takedown.visitorSees === 'removed' &&
    result.takedown.remix === 409 &&
    result.takedown.removedFor === 'check-community takedown' &&
    result.takedown.fanStrikes === 1 &&
    result.takedown.original === 'published' &&
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
