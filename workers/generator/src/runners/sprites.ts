import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateArtifact, providerFor } from '@gg/llm';
import { CURATED_GENRES, SpriteSheet, StyleCard, type CuratedGenre, type EntityRoster } from '@gg/schemas';
import { artPalette, buildOf, paintDesignSheet, rampsOf, RECIPES, spriteBases } from '@gg/sdk/art';
import { encodePng } from '@gg/sdk/png';
import { castOf, manifestFor, readGameFiles, settingOf } from '@gg/templates/node';
import { checkSpriteSheet, type CastMember, type ValidationReport } from '@gg/validators';
import { EXAMPLES } from '@gg/template-freeform/node';
import { exampleFor } from '../freeform.js';
import { fail, ok, readGdd, readJson, sumUsage, writeJson } from './stage-kit.js';
import type { StageContext, StageOutcome } from './types.js';

const SPRITES_SYSTEM = [
  "You design how a small 2D pixel-art game's characters and things look, as data: for each, a shipped sprite to start from, its own colours and a few small marks drawn on it.",
  'Every sprite reads at a glance: the player stands apart from everything that hurts, foes look like foes, pickups look worth picking up. A few deliberate pixels beat a busy redraw.',
].join('\n');

/** The letters a sprite is drawn with, and what a design may do with them. */
const LETTERS = [
  'Letters: k ink, w white, . clear. Ramps a design may give its own colour (five shades from the one you give, darkest first):',
  'hero 1 2 3 4 5 (skin, a body), garment g G h H (clothes), accent a A b B and c C z Z (hair, trim, fur), danger x d D e E (what hurts),',
  'secondary m M n N (a second hue), rim o v V y Y (leaves, wings, glows), wood p q Q r R (a hat, wood, a handle). Fixed: stone t T u U, ui i I, dark wood O s.',
].join('\n');

const RULES = [
  'Rules (checked; a design that breaks one is sent back):',
  "- start from one of the sprites its type may (same size and stance), and name only that sprite's animations;",
  "- an overlay's rows paint letters onto the sprite at rest ('.' keeps a pixel, '_' clears it, under: true paints only where the sprite is clear) and stay inside its frame; it moves with the body as it walks;",
  '- overlays change at most two thirds of any frame (they add marks, they do not redraw it), and leave no pixels apart from the body;',
  "- recolour only ramps the sprite or your overlays paint with; a foe never wears the player's colours, and no two types look alike;",
  '- with no outline, nothing that moves takes the colour of the floor.',
].join('\n');

/** A shipped sprite as the prompt shows it: its build, the ramps it paints with, its animations, and its rest frames side by side. */
export function describeBase(name: string): string {
  const r = RECIPES[name];
  if (!r) return `${name}: not a shipped sprite`;
  const facings = ['down', 'up', 'side'].filter((f) => r.anims[`${f}-idle`]);
  const shown = facings.length > 0 ? facings.map((f) => [`${f}-idle`, r.anims[`${f}-idle`]![0]!] as const) : [[Object.keys(r.anims)[0]!, Object.values(r.anims)[0]![0]!] as const];
  const ramps = Object.entries(rampsOf(r)).map(([ramp, n]) => `${ramp} ${n}`).join(', ') || 'fixed colours only';
  const rows = shown[0]![1].map((_, y) => `  ${shown.map(([, t]) => t[y]!).join('   ')}`);
  return [`${name}: ${buildOf(r)}; paints with ${ramps}; animations ${Object.keys(r.anims).join(', ')}; at rest (${shown.map(([a]) => a).join(', ')}):`, ...rows].join('\n');
}

/** The cast as the prompt lists it: each type, what it is, the sprite it draws as and the ones it may start from. */
function castLines(cast: readonly CastMember[], roster: EntityRoster | null): string {
  const archetypes = new Map((roster?.types ?? []).map((t) => [t.type, t.archetype]));
  return cast
    .map((c) => {
      const what = c.type === '@player' ? 'the player' : archetypes.has(c.type) ? `${c.role}; the ${archetypes.get(c.type)} under the game's name` : c.role;
      return `- ${c.type} (${what}): drawn as ${c.recipe}; may start from ${spriteBases(c.recipe).join(', ')}`;
    })
    .join('\n');
}

/** Designs to show as the example: the freeform example on the game's base that reads closest to the idea, else the first with designs. */
function spriteExample(base: string, prompt?: string): unknown {
  const own = (CURATED_GENRES as readonly string[]).includes(base) ? exampleFor(base as CuratedGenre, prompt) : null;
  return own?.content?.['sprites'] ?? EXAMPLES.find((e) => e.content?.['sprites'])?.content?.['sprites'];
}

/**
 * What of an answer holds on its own: designs with an error, a foe in the player's colours or a look-alike are left
 * out (those types draw as they ship), checked again until nothing more goes, since what is left out changes what the
 * rest is judged against.
 */
export function salvageSprites(sheet: SpriteSheet, check: (s: SpriteSheet) => ValidationReport): SpriteSheet {
  let kept = sheet;
  for (let round = 0; round < 8; round++) {
    const bad = new Set(check(kept).issues.flatMap((i) => (i.severity === 'error' || i.code === 'looks_like_player' || i.code === 'sprites_alike' ? [i.at?.path] : [])));
    if (bad.size === 0) return kept;
    kept = { version: 1, sprites: kept.sprites.filter((d) => !bad.has(d.type)) };
  }
  return { version: 1, sprites: [] };
}

/**
 * The sprites stage: the game's own look for its cast (content/sprites.json), one structured call for the whole cast,
 * held to the art rules in the game's palette (checkSpriteSheet). Everything the check finds goes back to the model as
 * a repair; when no answer passes, the designs of the best one that hold on their own are kept (a type left out draws
 * as it ships). A sheet already on disk that holds is kept, so a stage run again does not roll the cast's look anew.
 * Each design is drawn beside the sprite it starts from in reports/sprites.png, for review.
 */
export async function sprites(ctx: StageContext): Promise<StageOutcome> {
  const t0 = Date.now();
  const gddInfo = readGdd(ctx.gameDir);
  const files = readGameFiles(ctx.gameDir);
  const stylePath = join(ctx.gameDir, 'design', 'style.json');
  const style = existsSync(stylePath) ? StyleCard.safeParse(readJson(stylePath)) : null;
  if (!gddInfo || !files.systems || !style?.success) return fail('sprites need design/gdd.md, design/systems.json and design/style.json', 'spec_violation');
  const pal = artPalette(style.data.palette, style.data.outline);
  const cast = castOf(files);
  const check = (v: SpriteSheet) => checkSpriteSheet(v, { pal, types: cast });
  const path = join(ctx.gameDir, 'content', 'sprites.json');
  const existing = existsSync(path) ? SpriteSheet.safeParse(readJson(path)) : null;
  if (existing?.success && check(existing.data).ok) return ok(`kept content/sprites.json (${existing.data.sprites.length} designs)`, { durationMs: Date.now() - t0, artifactPath: path });

  const base = files.systems.genre === 'freeform' ? files.systems.composition.base : files.systems.genre;
  const roles = style.data.palette;
  const bases = [...new Set(cast.flatMap((c) => spriteBases(c.recipe)))];
  const gdd = gddInfo.fm;
  const prompt = [
    `Game: "${gdd.title}". Pillars: ${gdd.pillars.join(' / ')}.`,
    `Design document:\n${gddInfo.body.trim().slice(0, 2500)}`,
    files.roster ? `Its entities: ${files.roster.designNotes}` : '',
    `Setting: ${settingOf(files, manifestFor(files))}. Palette: background ${roles.background}, mid ${roles.mid}, foreground ${roles.foreground}, accent ${roles.accent}, danger ${roles.danger} (the hue of what hurts; the player's clothes sit opposite it), ui ${roles.ui}; outline ${style.data.outline}.`,
    `Its cast (the player is @player):\n${castLines(cast, files.roster)}`,
    `The sprites they may start from:\n${bases.map(describeBase).join('\n')}`,
    LETTERS,
    RULES,
    "Write content/sprites.json: version 1, sprites [{ type, base, recolor { ramp: '#rrggbb' }, overlays [{ anims ('*' or names), x, y, rows, under }] }], one design per type at most and at most eight overlays each; a type you leave out draws as it ships. Give the player and the types the idea names their own look.",
    `Example (another game's designs: their shape and the care they take):\n${JSON.stringify(spriteExample(base, ctx.request?.prompt))}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const res = await generateArtifact<SpriteSheet>({
    provider: providerFor(ctx.provider),
    model: ctx.model,
    artifact: 'SpriteSheet',
    system: SPRITES_SYSTEM,
    prompt,
    k: ctx.policy?.k ?? 1,
    repairRounds: ctx.policy?.repairRounds ?? 1,
    verify: (v) => check(v).issues.map((i) => i.message),
    score: (v) => v.sprites.length + 0.1 * v.sprites.reduce((n, d) => n + d.overlays.length, 0),
  });
  const selected = res.selected?.value;
  let sheet: SpriteSheet = selected ?? { version: 1, sprites: [] };
  const notes: string[] = [];
  if (!selected) {
    // The answer that keeps the most designs once those that do not hold are left out.
    for (const s of res.samples) {
      const kept = s.value ? salvageSprites(s.value, check) : null;
      if (kept && kept.sprites.length > sheet.sprites.length) sheet = kept;
    }
    notes.push(`${res.samples.length} samples rejected (${res.samples[0]?.issues?.[0] ?? 'provider error'}); kept ${sheet.sprites.length} design(s) that hold`);
  }
  writeJson(path, sheet);
  // The cast's look for review: each design beside the sprite it starts from (reports/sprites.png).
  if (sheet.sprites.length > 0) {
    mkdirSync(join(ctx.gameDir, 'reports'), { recursive: true });
    writeFileSync(join(ctx.gameDir, 'reports', 'sprites.png'), encodePng(paintDesignSheet(sheet, pal), 4));
  }
  const summary = `wrote content/sprites.json (${sheet.sprites.map((d) => `${d.type}<${d.base}`).join(', ') || 'no designs: the cast draws as it ships'})${notes.length ? `; ${notes.join('; ')}` : ''}`;
  return ok(summary, {
    usage: sumUsage(res),
    costUsd: res.totalCostUsd,
    durationMs: Date.now() - t0,
    turns: res.samples.length,
    artifactPath: path,
    promptHash: res.selected?.promptHash,
    pairs: selected ? [{ artifact: 'SpriteSheet', system: SPRITES_SYSTEM, prompt, output: selected }] : [],
  });
}
