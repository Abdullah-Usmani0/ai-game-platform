// End-to-end check of the community layer against a store holding a finished dry-run game (made by `pnpm demo`):
// the owner publishes it, a player plays (the session is recorded on pagehide) and rates it, the feed ranks it, the owner
// asks for a tester, and a tester claims the game, plays 30 s, reports and is paid. The owner's heatmap shows the
// player's position samples and quit point and two players' deaths, in the API and over the level editor. Then moderation: three players'
// reports suspend the game and a moderator's dismissals in the queue bring it back; a fan's remix is taken down for ip
// and the fan gets a strike; the fan's counter-notice waits its 14 days, while a second fan's appeal of an abuse
// removal is reinstated from the queue and the strike voided. Identities are the dev cookie ('moderator' is the file
// store's moderator).
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

  // 1. The owner publishes the game from the workspace panel; a non-owner may not. The workspace (jobs with their inputs,
  // the source) is the owner's: a stranger gets 404 from its API and the play page instead of the page.
  result.strangerPublish = (await api(`/api/games/${game.id}/publish`, 'player-a', { listed: true })).status;
  const strangerPage = await pageAs('player-a');
  await strangerPage.goto(`${url}/games/${game.id}`, { waitUntil: 'load', timeout: 30000 });
  result.workspace = {
    stranger: (await api(`/api/games/${game.id}`, 'player-a')).status,
    strangerSource: (await api(`/api/games/${game.id}/source`, 'player-a')).status,
    moderator: (await api(`/api/games/${game.id}`, 'moderator')).status,
    owner: (await api(`/api/games/${game.id}/source`, 'local-dev')).status,
    strangerLandsOn: new URL(strangerPage.url()).pathname,
  };
  await strangerPage.context().close();
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
  await owner.click('[data-testid="tab-levels"]');
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

  // 3c. A jam: a moderator opens one that started before this game was made; the owner enters the game from the jam
  //     page; voting opens; a player who played the entry 30 s votes from the page, one who did not is refused, the
  //     owner cannot vote on their own entry, two more vote through the API; results rank the entry once voting closes.
  const jamNow = Date.now();
  const jamSlug = `check-jam-${jamNow.toString(36)}`;
  const jamBody = { slug: jamSlug, title: 'Check Jam', theme: 'one room', startsAt: new Date(Date.parse(game.createdAt) - 60_000).toISOString(), submissionsClose: new Date(jamNow + 3_600_000).toISOString(), votingClose: new Date(jamNow + 7_200_000).toISOString() };
  result.jam = { strangerCreate: (await api('/api/jams', 'player-a', jamBody)).status };
  const jamCreated = await api('/api/jams', 'moderator', jamBody);
  result.jam.created = jamCreated.status;
  const jamId = jamCreated.json.jam?.id;
  await owner.goto(`${url}/jams/${jamSlug}`, { waitUntil: 'load', timeout: 30000 });
  await owner.waitForSelector('[data-testid="jam"][data-phase="open"]', { timeout: 15000 });
  await owner.selectOption('[data-testid="jam-pick"]', game.id);
  await owner.click('[data-testid="jam-submit"]');
  await owner.waitForSelector(`[data-testid="jam-entry"][data-game="${game.id}"]`, { timeout: 10000 });
  result.jam.strangerEntry = (await api(`/api/jams/${jamId}/entries`, 'player-a', { gameId: game.id })).status;
  result.jam.earlyVote = (await api(`/api/jams/${jamId}/votes`, 'player-b', { gameId: game.id, fun: 4, theme: 4, look: 4 })).status;
  result.jam.openVoting = (await api(`/api/jams/${jamId}/schedule`, 'moderator', { submissionsClose: new Date().toISOString() })).status;
  const jamVoter = await pageAs('player-b');
  await jamVoter.goto(`${url}/jams/${jamSlug}`, { waitUntil: 'load', timeout: 30000 });
  await jamVoter.waitForSelector('[data-testid="jam"][data-phase="voting"]', { timeout: 15000 });
  const voteForm = `[data-testid="jam-vote"][data-game="${game.id}"]`;
  for (const [k, v] of [['fun', '5'], ['theme', '4'], ['look', '4']]) await jamVoter.selectOption(`${voteForm} [data-testid="jam-vote-${k}"]`, v);
  await jamVoter.click(`${voteForm} [data-testid="jam-vote-save"]`);
  await jamVoter.waitForSelector(`${voteForm}[data-voted="yes"]`, { timeout: 10000 });
  const unplayed = await api(`/api/jams/${jamId}/votes`, 'player-a', { gameId: game.id, fun: 1, theme: 1, look: 1 });
  result.jam.unplayed = { status: unplayed.status, error: unplayed.json.error };
  result.jam.own = (await api(`/api/jams/${jamId}/votes`, 'local-dev', { gameId: game.id, fun: 5, theme: 5, look: 5 })).status;
  await api('/api/plays', 'player-d', { gameId: game.id, versionId: game.headVersionId, source: 'featured', durationS: 40, completed: false, levelsCompleted: 0, deaths: 0, events: [] });
  result.jam.votes = [(await api(`/api/jams/${jamId}/votes`, 'player-c', { gameId: game.id, fun: 4, theme: 3, look: 4 })).status, (await api(`/api/jams/${jamId}/votes`, 'player-d', { gameId: game.id, fun: 5, theme: 5, look: 4 })).status];
  result.jam.resultsDuringVoting = (await api(`/api/jams/${jamId}`, 'player-b')).json.results;
  result.jam.publish = (await api(`/api/jams/${jamId}/schedule`, 'moderator', { votingClose: new Date().toISOString() })).status;
  await jamVoter.goto(`${url}/jams/${jamSlug}`, { waitUntil: 'load', timeout: 30000 });
  await jamVoter.waitForSelector('[data-testid="jam-results"]', { timeout: 15000 });
  result.jam.rankShown = await jamVoter.getAttribute(`[data-testid="jam-result"][data-game="${game.id}"]`, 'data-rank');
  result.jam.result = ((await api(`/api/jams/${jamId}`, 'player-b')).json.results ?? []).find((r) => r.gameId === game.id) ?? null;
  result.jam.listed = (await api('/api/jams', 'player-b')).json.jams?.find((j) => j.slug === jamSlug)?.phase;
  await jamVoter.context().close();

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

  // 7. Appeals. The fan files a counter-notice from the remix's workspace: moderators see it and cannot reinstate it
  //    for 14 days. A second fan's remix removed for abuse is appealed and reinstated at once from the queue.
  const fanPage = await pageAs(fan);
  await fanPage.goto(`${url}/games/${remix.gameId}`, { waitUntil: 'load', timeout: 30000 });
  await fanPage.waitForSelector('[data-testid="appeal-form"][data-ready="yes"]', { timeout: 20000 });
  // Typing that lands before React takes the first keystrokes is reset by the panel's next refresh (the field is
  // controlled), so fill until Send is enabled; attempts above 1 are recorded.
  const value = (id) => fanPage.inputValue(`[data-testid="${id}"]`).catch(() => 'missing');
  let sendable = false;
  for (let attempt = 1; attempt <= 3 && !sendable; attempt++) {
    await fanPage.fill('[data-testid="appeal-statement"]', 'I state under penalty of perjury that this remix was removed by mistake: the sprites are my own.');
    await fanPage.fill('[data-testid="appeal-name"]', 'Fan One');
    await fanPage.fill('[data-testid="appeal-email"]', 'fan@example.com');
    if (!(await fanPage.isChecked('[data-testid="appeal-consent"]'))) await fanPage.click('[data-testid="appeal-consent"]');
    sendable = await fanPage.waitForSelector('[data-testid="appeal-send"]:not([disabled])', { timeout: 3000 }).then(() => true, () => false);
    if (!sendable || attempt > 1) result.appealForm = { attempt, sendable, statement: (await value('appeal-statement')).length, name: await value('appeal-name'), email: await value('appeal-email') };
  }
  await fanPage.click('[data-testid="appeal-send"]');
  await fanPage.waitForSelector('[data-testid="appeal-status"][data-status="open"]', { timeout: 15000 });
  const counter = ((await api('/api/appeals?status=open', 'moderator')).json.appeals ?? []).find((a) => a.gameId === remix.gameId);
  result.appeals = { counterListed: Boolean(counter), earlyReinstate: (await api(`/api/appeals/${counter?.id}/decide`, 'moderator', { decision: 'reinstate', note: '' })).status };
  const fan2 = `fan2-${Date.now().toString(36)}`;
  const remix2 = (await api(`/api/games/${game.id}/remix`, fan2, {})).json;
  await api(`/api/games/${remix2.gameId}/report`, 'player-b', { kind: 'abuse', note: 'offensive title' });
  const abuse = ((await api('/api/reports?status=open', 'moderator')).json.reports ?? []).find((r) => r.gameId === remix2.gameId);
  await api(`/api/reports/${abuse?.id}/resolve`, 'moderator', { resolution: 'remove', note: 'abusive title' });
  result.appeals.strikesBefore = (await api('/api/me', fan2)).json.strikes;
  result.appeals.filed = (await api(`/api/games/${remix2.gameId}/appeal`, fan2, { statement: 'The title quotes the original game and is not abusive.', name: 'Fan Two', email: 'fan2@example.com' })).status;
  await mod.goto(`${url}/moderation`, { waitUntil: 'load', timeout: 30000 });
  const card = `[data-testid="appeal"][data-game="${remix2.gameId}"]`;
  await mod.waitForSelector(card, { timeout: 15000 });
  result.appeals.counterButton = await mod.textContent(`[data-testid="appeal"][data-game="${remix.gameId}"] [data-testid="appeal-reinstate"]`);
  await mod.click(`${card} [data-testid="appeal-reinstate"]`);
  await mod.waitForSelector(card, { state: 'detached', timeout: 10000 });
  result.appeals.reinstated = (await api(`/api/games/${remix2.gameId}/community`, fan2)).json.state;
  result.appeals.strikesAfter = (await api('/api/me', fan2)).json.strikes;
  // The dev file server serves public buckets only: checkpoints and quarantined bundles stay private.
  result.appeals.privateBucket = (await fetch(`${url}/b/checkpoints/takedowns/x/index.html`)).status;

  ok =
    result.strangerPublish === 403 &&
    result.workspace.stranger === 404 &&
    result.workspace.strangerSource === 404 &&
    result.workspace.moderator === 200 &&
    result.workspace.owner === 200 &&
    result.workspace.strangerLandsOn === `/play/${game.id}` &&
    result.jam.strangerCreate === 403 &&
    result.jam.created === 201 &&
    result.jam.strangerEntry === 404 &&
    result.jam.earlyVote === 409 &&
    result.jam.openVoting === 200 &&
    result.jam.unplayed.status === 409 &&
    /play the entry/.test(result.jam.unplayed.error ?? '') &&
    result.jam.own === 409 &&
    result.jam.votes.every((s) => s === 200) &&
    result.jam.resultsDuringVoting === null &&
    result.jam.publish === 200 &&
    result.jam.rankShown === '1' &&
    result.jam.result?.votes === 3 &&
    result.jam.result?.rank === 1 &&
    result.jam.listed === 'closed' &&
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
    result.appeals.counterListed === true &&
    result.appeals.earlyReinstate === 409 &&
    /Reinstate from/.test(result.appeals.counterButton ?? '') &&
    result.appeals.filed === 201 &&
    result.appeals.strikesBefore === 1 &&
    result.appeals.reinstated === 'playable' &&
    result.appeals.strikesAfter === 0 &&
    result.appeals.privateBucket === 404 &&
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
