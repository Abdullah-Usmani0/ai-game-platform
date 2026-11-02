import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { blockedTermsFor, mentions, referencesForRequest } from '@gg/catalog';
import { generateArtifact, providerFor } from '@gg/llm';
import { DialogueFile, StoryBible } from '@gg/schemas';
import { LOSTDOG } from '@gg/template-freeform';
import { storyFeedback } from '@gg/template-core';
import { manifestFor, readGameFiles, storyFactsOf } from '@gg/templates/node';
import { checkStory, type StoryFacts } from '@gg/validators';
import { exampleFor } from '../freeform.js';
import { draftStory } from '../story-draft.js';
import { add, fail, ok, readGdd, readJson, writeJson, ZERO } from './stage-kit.js';
import type { PairDraft, StageContext, StageOutcome } from './types.js';

const STORY_SYSTEM = [
  "You plan the story of a small 2D game from the player's idea: who it is about, where, what happens in each level, and how it can end.",
  'Original only: no character, place or title from another work. Fit the idea: a quick arcade or puzzle game wants a light story or none; an adventure wants people, a quest and endings that follow what the player did.',
].join('\n');

const DIALOGUE_SYSTEM = [
  "You write a small 2D game's talk as data: the narration read before its levels, what its people say and the answers the player can give, the deeds and quests its flags follow, and how it ends.",
  'Every line is short and plain, in the voice the story sets. Flags come only from answers, nodes read and deeds, and the endings test them. Original only: no name from another work.',
].join('\n');

const DIALOGUE_RULES = [
  'Rules (checked; an answer that breaks one is sent back):',
  '- node ids are used once; every node an answer, a next, a start, a chapter or an ending names exists;',
  "- talks start only with the game's people (their speaker ids below); narration is spoken by `narrator`;",
  '- a person the talk places (people) stands once in a level, in a level the game has, and has a start;',
  '- a chapter is for one of the levels, one each; its narration (the node and those its next leads to) gives no answers and sets no flags;',
  '- the last ending has no tests and is the only one without; endings, quests, answers and starts test only flags something sets;',
  "- a deed hears one of the game's events below, about one of its types if it names one;",
  '- lines at most 160 characters, at most 6 to a node, at most 4 answers.',
].join('\n');

/** Every word of a talk a player reads or a quest shows: what the blocked-term screen looks at. */
export function storyText(d: DialogueFile): string {
  return [...Object.values(d.names), ...d.nodes.flatMap((n) => [...n.lines, ...n.choices.map((c) => c.label)]), ...(d.chapters ?? []).flatMap((c) => (c.title ? [c.title] : [])), ...(d.endings ?? []).map((e) => e.title), ...(d.quests ?? []).map((q) => q.title)].join('\n');
}

/** The names of other works a talk's words carry, for an idea (the works it cites, by title or by their names). */
export function storyMentions(d: DialogueFile, idea: string, referenceTitles: readonly string[] = []): string[] {
  const refs = referencesForRequest(idea, [...referenceTitles]);
  return mentions(storyText(d), blockedTermsFor(refs.matched, refs.unmatched));
}

function bibleText(b: StoryBible): string {
  return [b.premise, b.setting, b.protagonist, b.tone, ...b.cast.flatMap((c) => [c.name, c.role]), ...b.chapters.flatMap((c) => [c.title, c.beat]), ...b.endings.flatMap((e) => [e.title, e.how])].join('\n');
}

/** The looks a person placed from the talk can wear (people[].look), as the prompt describes them. */
const LOOKS = '0 a villager in an apron, 1 an elder in a hooded cloak with a staff, 2 a child, 3 a traveller in a wide hat with a pack';

/**
 * The people a game places, as the prompt names them: who they are by speaker id; in a game that places people from
 * its talk, that the story places its own; or that it has none.
 */
function peopleLine(facts: StoryFacts): string {
  if (facts.people) {
    const own = facts.speakers.length > 0 ? ` Its own people talk too, by speaker id: ${facts.speakers.join(', ')}.` : '';
    return `Its people are the story's own: place each you want met in a level with people [{ speaker, level, near: start | middle | end, look }] (look: ${LOOKS}), give each a name, a voice and a start, and talk only with those you place.${own} Two to five people suit a short game; one a level at least where the story turns.`;
  }
  return facts.speakers.length > 0
    ? `Its people (the only ones a talk can start with), by speaker id: ${facts.speakers.join(', ')}. Give each a name and a voice of your own.`
    : 'It has no people to talk to: tell the story in narration (chapters and an ending), with no starts and no people.';
}

/**
 * A talk told well, shown for its craft only: lines short and in each speaker's own voice, answers that set flags the
 * story later reads (a start, an ending, a quest), a deed that remembers what the player did, endings that follow from
 * it. Another game's: its names and lines are never to be reused.
 */
const CRAFT = (() => {
  const d = LOSTDOG.content?.['dialogue'];
  return d ? `A well-told talk from another game, for its craft only (short lines in each speaker's voice, answers whose flags the story reads later, a deed, endings that follow from what was done); never reuse its names, places or lines:\n${JSON.stringify(d)}` : '';
})();

/** The events and types a deed may hear, as the prompt lists them. */
function deedsLine(facts: StoryFacts): string {
  return `Events a deed may hear: ${facts.events.join(', ')}. Types a deed may name (with death: a foe beaten; with pickup: a thing picked up): ${facts.types.join(', ')}.`;
}

/** The story's events, bound to a sound in design/feedback.json so the gate hears them answered (a quest told, the ending). */
function bindStoryFeedback(gameDir: string, d: DialogueFile): string[] {
  const path = join(gameDir, 'design', 'feedback.json');
  const table = existsSync(path) ? readJson<Array<{ event: string; channels: string[] }>>(path) : [];
  const added = storyFeedback(d).filter((b) => !table.some((t) => t.event === b.event));
  if (added.length > 0) writeJson(path, [...table, ...added]);
  return added.map((b) => b.event);
}

/**
 * The story stage, for every game: its story planned from the idea (design/story.json, a StoryBible), then the talk
 * that tells it (content/dialogue.json), held to the game it is told in (checkStory: the game's people, its events and
 * types, its levels) and to the blocked-term screen. It runs once the game's systems, behaviours and own code are
 * known, before its levels. A story of depth none writes no talk, and leaves the game as it was. A talk no answer gets
 * right is not written: the game keeps the talk it has (its genre's own, if any). A story written before and still
 * holding is kept.
 */
export async function story(ctx: StageContext): Promise<StageOutcome> {
  const t0 = Date.now();
  const gddInfo = readGdd(ctx.gameDir);
  const files = readGameFiles(ctx.gameDir);
  if (!gddInfo || !files.systems) return fail('the story needs design/gdd.md and design/systems.json', 'spec_violation');
  const g = manifestFor(files);
  const facts = storyFactsOf(ctx.gameDir);
  const biblePath = join(ctx.gameDir, 'design', 'story.json');
  const talkPath = join(ctx.gameDir, 'content', 'dialogue.json');
  const kept = existsSync(biblePath) ? StoryBible.safeParse(readJson(biblePath)) : null;
  const keptTalk = existsSync(talkPath) ? DialogueFile.safeParse(readJson(talkPath)) : null;
  if (kept?.success && (kept.data.depth === 'none' || (keptTalk?.success && checkStory(keptTalk.data, facts).ok))) {
    return ok(`kept design/story.json (${kept.data.depth})`, { durationMs: Date.now() - t0, artifactPath: biblePath });
  }

  // Names the idea cites stay out of every word of the story, as they stay out of the GDD.
  const req = ctx.request;
  const refs = req ? referencesForRequest(req.prompt, req.referenceTitles) : { matched: [], unmatched: [] };
  const blocked = blockedTermsFor(refs.matched, refs.unmatched);
  // A composed game with people to talk to drafts from the hand-made game it was composed after, where that one tells a story.
  const after = facts.people && files.systems?.genre === 'freeform' ? exampleFor(files.systems.composition.base, req?.prompt ?? '') : null;
  const example = after?.systems.systems.some((s) => s.id === 'talk') ? DialogueFile.safeParse(after.content?.['dialogue']) : null;
  const draft = draftStory({ genre: g, gdd: gddInfo.fm, levels: facts.levels, idea: req?.prompt ?? '', example: example?.success ? example.data : null });
  const gdd = gddInfo.fm;
  const provider = providerFor(ctx.provider);
  const k = ctx.policy?.k ?? 1;
  const repairRounds = ctx.policy?.repairRounds ?? 1;
  const pairs: PairDraft[] = [];
  let usage = { ...ZERO };
  let cost = 0;
  let turns = 0;

  const biblePrompt = [
    `Game: "${gdd.title}" (${g.name}). Pillars: ${gdd.pillars.join(' / ')}.`,
    `Design document:\n${gddInfo.body.trim().slice(0, 2500)}`,
    `It has ${facts.levels} level(s): a chapter for each, from 1.`,
    peopleLine(facts),
    'Write design/story.json: version 1, depth (none | light | rich), premise, setting, protagonist, tone, cast [{ id, name, role }], chapters [{ level, title, beat }], endings [{ title, how }] (the one every other player reaches last).',
    `Example (a story's shape: write the game's own):\n${JSON.stringify(draft.bible)}`,
  ].join('\n\n');
  const bibleRes = await generateArtifact<StoryBible>({
    provider,
    model: ctx.model,
    artifact: 'StoryBible',
    system: STORY_SYSTEM,
    prompt: biblePrompt,
    k,
    repairRounds,
    verify: (v) => [
      ...mentions(bibleText(v), blocked).map((m) => `names "${m}", which belongs to another work: leave it out`),
      ...v.chapters.flatMap((c) => (c.level > facts.levels ? [`chapter ${c.level} is for a level the game does not have (it has ${facts.levels})`] : [])),
    ],
    score: (v) => (v.depth === 'rich' ? 2 : v.depth === 'light' ? 1 : 0) + 0.1 * v.chapters.length,
  });
  usage = add(usage, bibleRes.samples.reduce((a, s) => add(a, s.usage), { ...ZERO }));
  cost += bibleRes.totalCostUsd;
  turns += bibleRes.samples.length;
  const bible = bibleRes.selected?.value ?? draft.bible;
  if (bibleRes.selected?.value) pairs.push({ artifact: 'StoryBible', system: STORY_SYSTEM, prompt: biblePrompt, output: bibleRes.selected.value });
  writeJson(biblePath, bible);
  const done = (summary: string) => ok(summary, { usage, costUsd: cost, durationMs: Date.now() - t0, turns, artifactPath: biblePath, promptHash: bibleRes.selected?.promptHash, pairs });
  if (bible.depth === 'none') return done(`wrote design/story.json (depth none: the play speaks for itself${keptTalk?.success ? '; the talk it has is kept' : ''})`);

  const talkPrompt = [
    `Game: "${gdd.title}" (${g.name}). Its story (design/story.json):\n${JSON.stringify(bible)}`,
    `It has ${facts.levels} level(s).`,
    peopleLine(facts),
    deedsLine(facts),
    DIALOGUE_RULES,
    `Write content/dialogue.json: version 1, names { speaker: name }, nodes [{ id, speaker, lines, choices [{ label, to, set?, when? }], next?, set? }], starts [{ speaker, node, when? }], chapters [{ level, title?, node? }] (chapter 1's node is the prologue), endings [{ id, title, when?, node }], quests [{ id, title, start, done }], deeds [{ on, type?, set }]${facts.people ? ', people [{ speaker, level, near?, look? }]' : ''}.`,
    CRAFT,
    `Example (a talk's shape: write the game's own from its story):\n${JSON.stringify(draft.dialogue ?? (keptTalk?.success ? keptTalk.data : null) ?? draftStory({ genre: g, gdd, levels: facts.levels, idea: 'a story' }).dialogue)}`,
  ].join('\n\n');
  const talkRes = await generateArtifact<DialogueFile>({
    provider,
    model: ctx.model,
    artifact: 'DialogueFile',
    system: DIALOGUE_SYSTEM,
    prompt: talkPrompt,
    k,
    repairRounds,
    verify: (v) => [...checkStory(v, facts).issues.filter((i) => i.severity === 'error').map((i) => i.message), ...mentions(storyText(v), blocked).map((m) => `names "${m}", which belongs to another work: leave it out`)],
    score: (v) => v.nodes.length + 2 * (v.endings ?? []).length + (v.quests ?? []).length,
  });
  usage = add(usage, talkRes.samples.reduce((a, s) => add(a, s.usage), { ...ZERO }));
  cost += talkRes.totalCostUsd;
  turns += talkRes.samples.length;
  const talk = talkRes.selected?.value;
  if (!talk) {
    const why = talkRes.samples[0]?.issues?.[0] ?? 'provider error';
    return done(`wrote design/story.json (${bible.depth}); no talk held (${why})${keptTalk?.success ? ': the talk it has is kept' : ''}`);
  }
  pairs.push({ artifact: 'DialogueFile', system: DIALOGUE_SYSTEM, prompt: talkPrompt, output: talk });
  writeJson(talkPath, talk);
  const bound = bindStoryFeedback(ctx.gameDir, talk);
  const told = `${talk.nodes.length} nodes, ${(talk.chapters ?? []).length} chapter(s), ${(talk.endings ?? []).length} ending(s), ${(talk.quests ?? []).length} quest(s)`;
  return done(`wrote design/story.json (${bible.depth}) and content/dialogue.json (${told})${bound.length ? `; bound ${bound.join(', ')}` : ''}`);
}
