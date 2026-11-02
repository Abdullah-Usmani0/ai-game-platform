import { UNSTABLE_DEED_EVENTS, type DialogueFile, type FlagTest } from '@gg/schemas';
import { err, report, warn, type Issue, type ValidationReport } from './report.js';

export interface DialogueCast {
  /** Who in the game can be talked to: the speakers its people talk as (an NPC's `speaker` prop, else its type). */
  speakers?: readonly string[];
}

/**
 * The rules a game's talk is held to, beyond the schema (content/dialogue.json):
 * - node, ending and quest ids are each used once, and every node a choice, a `next`, a start or an ending names
 *   exists;
 * - the last ending has no tests (every player who reaches no other ending reaches it), and no earlier one lacks them
 *   (it would hide the endings after it);
 * - a flag tested to be set is set somewhere: by a node, an answer or a deed (otherwise what tests it is dead: a talk
 *   never offered, an answer never shown, an ending nobody reaches, a quest that never begins or never ends);
 * - each start's speaker is someone in the game (a warning: a level may name its people as it likes);
 * - no deed listens to an event only the page emits (ui_open, ui_close, feedback, audio_play);
 * - a level has one chapter at most, and its narration (the node and those its `next` leads to) exists, asks for no
 *   answer and sets no flag;
 * - a person the talk places stands once in a level, and has a talk to start (someone placed with nothing to say is
 *   never heard).
 * Whether each ending can actually be reached in play is the story prover's.
 */
export function validateDialogue(file: DialogueFile, cast: DialogueCast = {}): ValidationReport {
  const issues: Issue[] = [];
  const nodes = new Set<string>();
  for (const n of file.nodes) {
    if (nodes.has(n.id)) issues.push(err('node_duplicate', `node '${n.id}' is defined twice`, { path: `nodes.${n.id}` }));
    nodes.add(n.id);
  }
  const known = (id: string, path: string, what: string) => {
    if (!nodes.has(id)) issues.push(err('node_unknown', `${what} names node '${id}', which the talk does not have`, { path }));
  };
  for (const n of file.nodes) {
    if (n.next) known(n.next, `nodes.${n.id}.next`, `node '${n.id}' goes on to`);
    n.choices.forEach((c, i) => known(c.to, `nodes.${n.id}.choices.${i}`, `answer '${c.label}'`));
  }
  file.starts.forEach((s, i) => known(s.node, `starts.${i}`, `${s.speaker}'s talk`));
  const endings = file.endings ?? [];
  const quests = file.quests ?? [];
  const deeds = file.deeds ?? [];
  const once = (ids: readonly string[], code: string, what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issues.push(err(code, `${what} '${id}' is defined twice`, { path: `${what}s.${id}` }));
      seen.add(id);
    }
  };
  once(endings.map((e) => e.id), 'ending_duplicate', 'ending');
  once(quests.map((q) => q.id), 'quest_duplicate', 'quest');
  endings.forEach((e, i) => {
    known(e.node, `endings.${e.id}`, `ending '${e.id}'`);
    const last = i === endings.length - 1;
    const tested = (e.when ?? []).length > 0;
    if (last && tested) issues.push(err('ending_no_default', `the last ending, '${e.id}', has tests: the last ending is every other player's, so it has none`, { path: `endings.${e.id}` }));
    if (!last && !tested) issues.push(err('ending_shadowed', `ending '${e.id}' has no tests, so no ending after it can be reached: only the last ending may have none`, { path: `endings.${e.id}` }));
  });

  // Chapters: one a level, their narration there to read, and narration only (it is read before play begins, so it
  // can neither ask nor change anything).
  const byId = new Map(file.nodes.map((n) => [n.id, n]));
  const chaptered = new Set<number>();
  for (const c of file.chapters ?? []) {
    if (chaptered.has(c.level)) issues.push(err('chapter_duplicate', `level ${c.level} has two chapters`, { path: `chapters.${c.level}` }));
    chaptered.add(c.level);
    if (!c.node) continue;
    known(c.node, `chapters.${c.level}`, `chapter ${c.level}`);
    const read = new Set<string>();
    for (let n = byId.get(c.node); n && !read.has(n.id); n = n.next ? byId.get(n.next) : undefined) {
      read.add(n.id);
      if (n.choices.length > 0) issues.push(err('narration_answers', `chapter ${c.level}'s narration reaches node '${n.id}', which asks for an answer: narration is read before play, so it may not ask`, { path: `nodes.${n.id}` }));
      if (Object.keys(n.set ?? {}).length > 0) issues.push(err('narration_flags', `chapter ${c.level}'s narration reaches node '${n.id}', which sets flags: narration changes nothing in play`, { path: `nodes.${n.id}` }));
    }
  }

  // A deed hears the game, never the page: scenes and feedback happen only in the browser.
  deeds.forEach((d, i) => {
    if (UNSTABLE_DEED_EVENTS.includes(d.on)) issues.push(err('deed_unstable', `deed ${i + 1} listens to '${d.on}', which only the page emits, so a replay of the same run would set other flags`, { path: `deeds.${i}` }));
  });

  // What sets each flag: a node read, an answer given, a deed done.
  const set = new Set<string>();
  for (const n of file.nodes) {
    for (const f of Object.keys(n.set ?? {})) set.add(f);
    for (const c of n.choices) for (const f of Object.keys(c.set ?? {})) set.add(f);
  }
  for (const d of deeds) for (const f of Object.keys(d.set)) set.add(f);
  const read = (tests: readonly FlagTest[] | undefined, path: string, what: string) => {
    for (const t of tests ?? []) {
      if (t.is && !set.has(t.flag)) issues.push(err('flag_never_set', `${what} needs flag '${t.flag}', which no node, answer or deed sets`, { path }));
    }
  };
  for (const n of file.nodes) n.choices.forEach((c, i) => read(c.when, `nodes.${n.id}.choices.${i}`, `answer '${c.label}'`));
  file.starts.forEach((s, i) => read(s.when, `starts.${i}`, `${s.speaker}'s talk at '${s.node}'`));
  for (const e of endings) read(e.when, `endings.${e.id}`, `ending '${e.id}'`);
  for (const q of quests) {
    read(q.start, `quests.${q.id}.start`, `quest '${q.id}' to begin`);
    read(q.done, `quests.${q.id}.done`, `quest '${q.id}' to be done`);
  }

  // The people the talk places: once a level each, and each with something to say.
  const placed = new Set<string>();
  const talks = new Set(file.starts.map((x) => x.speaker));
  (file.people ?? []).forEach((p, i) => {
    const at = `${p.speaker}@${p.level}`;
    if (placed.has(at)) issues.push(err('person_duplicate', `'${p.speaker}' stands in level ${p.level} twice`, { path: `people.${i}` }));
    placed.add(at);
    if (!talks.has(p.speaker)) issues.push(err('person_silent', `'${p.speaker}' is placed in level ${p.level}, but no talk starts with them: give them a start`, { path: `people.${i}` }));
  });

  if (cast.speakers) {
    const people = new Set(cast.speakers);
    for (const s of new Set(file.starts.map((x) => x.speaker))) {
      if (!people.has(s)) issues.push(warn('start_nobody', `talks start with '${s}', but nobody in the game talks as '${s}'`, { path: 'starts' }));
    }
  }
  return report(issues, { nodes: file.nodes.length, endings: endings.length, quests: quests.length, deeds: deeds.length });
}

/** What a game's story may use, read from the game: its people, the events it emits, its types, its levels. */
export interface StoryFacts {
  /** The speakers the game's people talk as: the only ones a talk can start with. */
  speakers: readonly string[];
  /** The events the game emits: its systems', its own systems' contracts', its behaviours', the sim's. */
  events: readonly string[];
  /** The game's entity types: what a deed's type may name. */
  types: readonly string[];
  /** How many levels the game has: a chapter is for one of them. */
  levels: number;
  /**
   * Whether the game places people from its talk (a composed game that runs the talk block): then the speakers its
   * `people` name are the game's people too, each standing where the talk puts them.
   */
  people?: boolean;
}

/**
 * A story held to the game it is written for, beyond validateDialogue's rules: its talks start only with people the
 * game places (an error here, not a warning: a talk with nobody is never heard), its own types or, in a game that
 * places people from its talk, those its `people` name; its deeds hear events the game emits, about types it has (a
 * deed on anything else never happens, so what tests its flags is dead); its chapters and people are for levels it has.
 */
export function checkStory(file: DialogueFile, facts: StoryFacts): ValidationReport {
  const people = file.people ?? [];
  const base = validateDialogue(file, { speakers: [...facts.speakers, ...(facts.people ? people.map((p) => p.speaker) : [])] });
  const issues: Issue[] = base.issues.map((i) => (i.code === 'start_nobody' ? { ...i, code: 'speaker_unplaced', severity: 'error' } : i));
  const events = new Set(facts.events);
  const types = new Set(facts.types);
  (file.deeds ?? []).forEach((d, i) => {
    if (!events.has(d.on)) issues.push(err('deed_event_unknown', `deed ${i + 1} listens to '${d.on}', which this game never emits`, { path: `deeds.${i}` }));
    if (d.type !== undefined && !types.has(d.type)) issues.push(err('deed_type_unknown', `deed ${i + 1} is about '${d.type}', and this game has no such thing`, { path: `deeds.${i}` }));
  });
  for (const c of file.chapters ?? []) {
    if (c.level > facts.levels) issues.push(err('chapter_beyond', `chapter ${c.level} is for a level the game does not have (it has ${facts.levels})`, { path: `chapters.${c.level}` }));
  }
  if (people.length > 0 && !facts.people) issues.push(err('people_unplaced', "the talk places people, but this game places none from its talk: its people are its own (talk only with them, and leave people out)", { path: 'people' }));
  people.forEach((p, i) => {
    if (facts.people && p.level > facts.levels) issues.push(err('person_beyond', `'${p.speaker}' is placed in level ${p.level}, which the game does not have (it has ${facts.levels})`, { path: `people.${i}` }));
  });
  return report(issues, { ...base.metrics, people: people.length });
}
