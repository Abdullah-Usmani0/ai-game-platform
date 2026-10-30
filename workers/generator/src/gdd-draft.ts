import { GddFrontmatter, type AnyGddFrontmatter, type CreateRequest } from '@gg/schemas';
import { plannedLevelCount, type GenreManifest } from '@gg/template-core';

/** A title from the first words of the prompt: "a tight cave platformer about..." -> "Tight Cave Platformer". */
export function titleFromPrompt(prompt: string): string {
  const words = prompt
    .split(/[.!?\n]/)[0]!
    .replace(/[^a-zA-Z0-9' ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(a|an|the|about|with|where|that|of|and|in|on|for|to|make|build|create|game|games|i|want|me|like|named|style|reference)$/i.test(w))
    .slice(0, 4)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
  return words.length ? words.join(' ').slice(0, 80) : 'Untitled Game';
}

export function slugify(s: string): string {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base.length >= 3 ? base : `game-${base}`.slice(0, 40);
}

/** Deterministic front matter from the request and the genre defaults: the dry run's output and the fallback. */
export function draftFrontmatter(req: CreateRequest, g: GenreManifest): GddFrontmatter {
  const budget = g.scopeBudget[req.scopeTier];
  const fsmIds = new Set(g.entityDefs.filter((e) => e.fsm && !e.boss).map((e) => e.fsm as string));
  // A genre with a boss puts one on the last level when the tier's budget allows it.
  const bosses = g.entityDefs.some((e) => e.boss) ? Math.min(1, budget.bosses) : 0;
  return GddFrontmatter.parse({
    title: req.title ?? titleFromPrompt(req.prompt),
    genre: g.id,
    scopeTier: req.scopeTier,
    pillars: g.gddDefaults.pillars,
    scope: { levels: plannedLevelCount(g.levelGrammar.kind, budget.levels), enemies: Math.min(budget.enemies, Math.max(1, fsmIds.size)), items: Math.min(budget.items, Math.max(1, g.collectibleTypes.length)), bosses },
    targets: g.gddDefaults.targets,
    verbs: g.gddDefaults.verbs,
    feedbackEvents: g.gddDefaults.feedbackEvents,
  });
}

/** A farm's GDD body: seasons, crops and a buyer's quota instead of enemies and deaths. */
function draftFarmBody(req: CreateRequest, g: GenreManifest, fm: AnyGddFrontmatter): string {
  const n = fm.scope.levels;
  const seasons = `${n} season${n === 1 ? '' : 's'}`;
  const feedback = fm.feedbackEvents.map((f) => `${f.event}: ${f.channels.join(', ')}`).join('; ');
  return [
    '## Concept',
    req.prompt.trim(),
    '',
    `A ${fm.scopeTier} ${g.name.toLowerCase()} built on the fixed runtime: ${seasons} on a farm, the default crops (turnip, lettuce, tomato that bears again, corn) unless content/crops.json names others. The player's verbs are ${fm.verbs.join(', ')}.`,
    '',
    '## Pillars',
    ...fm.pillars.map((p, i) => `${i + 1}. ${p[0]!.toUpperCase()}${p.slice(1)}: every system and season is judged against this.`),
    '',
    '## Core loop',
    `30 seconds: till a plot, sow the seed in hand and water it. 5 minutes: a season of days: harvest what ripened overnight, ship it at the bin, buy better seeds at the stall with yesterday's pay, sow and water, go to bed before two. Session (${fm.targets.sessionMin} min): make every season's quota, each a little harder than the last.`,
    '',
    '## Progression',
    `Each of the ${seasons} starts fresh on its own farm: the field grows from about ten plots toward thirty, in two fields later on, and the buyer's quota rises from about half of what an ideal season earns toward two thirds. Seeds sown in the last days cannot ripen in time, so a season is planned. Target ${fm.targets.levelTimeS} seconds a season.`,
    '',
    '## Scope',
    `${seasons}, no enemies, items or bosses: the crops and the economy are the content (tier ${fm.scopeTier}).`,
    '',
    '## Feedback',
    `Every listed event produces its channels at runtime through the feedback binder and the juice linter proves it: ${feedback}. The farm's own events (till, plant, water, harvest, ship, payout, buy, sleep, morning, dusk, a job that cannot be done) each have a sound.`,
    '',
  ].join('\n');
}

/** A GDD body with every required section, written from the concept and the front matter. */
export function draftBody(req: CreateRequest, g: GenreManifest, fm: AnyGddFrontmatter): string {
  if (g.levelGrammar.kind === 'farm') return draftFarmBody(req, g, fm);
  const enemies = g.entityDefs.filter((e) => e.fsm && !e.boss).map((e) => e.type).slice(0, fm.scope.enemies);
  const bosses = g.entityDefs.filter((e) => e.boss).map((e) => e.type).slice(0, fm.scope.bosses);
  const items = g.collectibleTypes.slice(0, fm.scope.items);
  const feedback = fm.feedbackEvents.map((f) => `${f.event}: ${f.channels.join(', ')}`).join('; ');
  const levelsNoun = g.levelGrammar.kind === 'arena' ? 'arena' : 'level';
  return [
    '## Concept',
    req.prompt.trim(),
    '',
    `A ${fm.scopeTier} ${g.name.toLowerCase()} built on the fixed runtime: ${fm.scope.levels} ${levelsNoun}${fm.scope.levels === 1 ? '' : 's'}, ${enemies.length} enemy type${enemies.length === 1 ? '' : 's'} (${enemies.join(', ')}), ${items.length} item type${items.length === 1 ? '' : 's'} (${items.join(', ')}). The player's verbs are ${fm.verbs.join(', ')}.`,
    '',
    '## Pillars',
    ...fm.pillars.map((p, i) => `${i + 1}. ${p[0]!.toUpperCase()}${p.slice(1)}: every system and level is judged against this.`),
    '',
    '## Core loop',
    `30 seconds: ${fm.verbs.slice(0, 2).join(' and ')} through the first segment, learn the first threat, collect the first ${items[0] ?? 'item'}. 5 minutes: clear a ${levelsNoun}, die at most ${fm.targets.deathsPerLevel} times, retry for a cleaner run. Session (${fm.targets.sessionMin} min): finish the ramp and chase a better score.`,
    '',
    '## Progression',
    g.levelGrammar.kind === 'arena'
      ? `Pressure ramps over ${fm.targets.levelTimeS} seconds: edge spawns first, rings later, a tougher enemy after the midpoint. Each run ends in victory or death; progress is score and survival time.`
      : `Difficulty rises monotonically across ${fm.scope.levels} ${levelsNoun}s from 0.15 to about 0.75: each ${levelsNoun} introduces one new element (a wider gap, a wall, a new enemy) and the first ten tiles of every ${levelsNoun} are safe. Target ${fm.targets.levelTimeS} seconds per ${levelsNoun}.`,
    '',
    '## Scope',
    `${fm.scope.levels} ${levelsNoun}${fm.scope.levels === 1 ? '' : 's'}, ${fm.scope.enemies} enemy type${fm.scope.enemies === 1 ? '' : 's'}, ${fm.scope.items} item type${fm.scope.items === 1 ? '' : 's'}, ${fm.scope.bosses} boss${fm.scope.bosses === 1 ? '' : 'es'}${bosses.length ? ` (${bosses.join(', ')} on the last ${levelsNoun})` : ''} (tier ${fm.scopeTier}).`,
    '',
    '## Feedback',
    `Every listed event produces its channels at runtime through the feedback binder and the juice linter proves it: ${feedback}. Hit pause and shake stay inside the clamps; no silent first ten seconds.`,
    '',
  ].join('\n');
}

export function renderGdd(fm: AnyGddFrontmatter, body: string): string {
  return `---\n${JSON.stringify(fm)}\n---\n${body.trim()}\n`;
}
