import { DialogueFile } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { checkStory, validateDialogue } from './dialogue.js';

/** A keeper with a quest, a deed and two endings: sound as written. */
const STORY = {
  version: 1,
  names: { keeper: 'The Keeper' },
  nodes: [
    { id: 'hello', speaker: 'keeper', lines: ['The candle is out.'], choices: [{ label: 'I will light it', to: 'thanks', set: { asked: true } }, { label: 'Not I', to: 'bye' }] },
    { id: 'thanks', speaker: 'keeper', lines: ['Then go.'] },
    { id: 'bye', speaker: 'keeper', lines: ['Then the dark keeps it.'], next: 'thanks' },
    { id: 'lit-end', speaker: 'narrator', lines: ['The candle burned.'] },
    { id: 'dark-end', speaker: 'narrator', lines: ['The dark kept it.'] },
  ],
  starts: [{ speaker: 'keeper', node: 'hello' }],
  endings: [
    { id: 'lit', title: 'The Candle Lit', when: [{ flag: 'lit', is: true }], node: 'lit-end' },
    { id: 'dark', title: 'The Long Dark', node: 'dark-end' },
  ],
  quests: [{ id: 'candle', title: 'The Candle', start: [{ flag: 'asked', is: true }], done: [{ flag: 'lit', is: true }] }],
  deeds: [{ on: 'custom:light', set: { lit: true } }],
};
const codes = (file: unknown, speakers?: string[]) => validateDialogue(DialogueFile.parse(file), { speakers }).issues.map((i) => i.code).sort();

describe('validateDialogue', () => {
  it('passes a sound story, and counts what it holds', () => {
    const r = validateDialogue(DialogueFile.parse(STORY), { speakers: ['keeper'] });
    expect(r.issues).toEqual([]);
    expect(r.metrics).toEqual({ nodes: 5, endings: 2, quests: 1, deeds: 1 });
  });

  it('finds nodes that are named but missing, and ids used twice', () => {
    expect(codes({ ...STORY, nodes: [...STORY.nodes, STORY.nodes[1]] })).toEqual(['node_duplicate']);
    expect(codes({ ...STORY, starts: [{ speaker: 'keeper', node: 'nowhere' }] })).toEqual(['node_unknown']);
    expect(codes({ ...STORY, nodes: STORY.nodes.map((n) => (n.id === 'bye' ? { ...n, next: 'gone' } : n)) })).toEqual(['node_unknown']);
    expect(codes({ ...STORY, endings: [{ ...STORY.endings[0], node: 'gone' }, STORY.endings[1]] })).toEqual(['node_unknown']);
    expect(codes({ ...STORY, endings: [STORY.endings[0], { ...STORY.endings[1], id: 'lit' }] })).toEqual(['ending_duplicate']);
    expect(codes({ ...STORY, quests: [STORY.quests[0], STORY.quests[0]] })).toEqual(['quest_duplicate']);
  });

  it('holds the endings to one default, the last', () => {
    expect(codes({ ...STORY, endings: [STORY.endings[0]] })).toEqual(['ending_no_default']);
    expect(codes({ ...STORY, endings: [STORY.endings[1], { ...STORY.endings[0], id: 'later' }] })).toEqual(['ending_no_default', 'ending_shadowed']);
  });

  it('finds a flag tested set that nothing sets: the ending, quest or answer that tests it is dead', () => {
    expect(codes({ ...STORY, deeds: [] })).toEqual(['flag_never_set', 'flag_never_set']);
    // Tested unset, a flag nobody sets always holds: nothing is dead.
    expect(codes({ ...STORY, starts: [{ speaker: 'keeper', node: 'hello', when: [{ flag: 'gone', is: false }] }] })).toEqual([]);
    expect(codes({ ...STORY, starts: [{ speaker: 'keeper', node: 'hello', when: [{ flag: 'gone', is: true }] }] })).toEqual(['flag_never_set']);
  });

  it('keeps deeds to the game: none hears what only the page emits', () => {
    expect(codes({ ...STORY, deeds: [...STORY.deeds, { on: 'ui_close', set: { closed: true } }] })).toEqual(['deed_unstable']);
  });

  it('holds chapters to one a level, and their narration to words alone', () => {
    const told = { ...STORY, nodes: [...STORY.nodes, { id: 'once', speaker: 'narrator', lines: ['Once, a candle burned.'], next: 'still' }, { id: 'still', speaker: 'narrator', lines: ['It burns still.'] }] };
    expect(codes({ ...told, chapters: [{ level: 1, title: 'The Candle', node: 'once' }, { level: 2, title: 'Dark' }] })).toEqual([]);
    expect(codes({ ...told, chapters: [{ level: 1, node: 'once' }, { level: 1, node: 'still' }] })).toEqual(['chapter_duplicate']);
    expect(codes({ ...told, chapters: [{ level: 1, node: 'gone' }] })).toEqual(['node_unknown']);
    // A narration that leads on to a question, or that sets a flag on the way, is not narration.
    expect(codes({ ...told, chapters: [{ level: 1, node: 'bye' }] })).toEqual([]);
    expect(codes({ ...told, chapters: [{ level: 1, node: 'hello' }] })).toEqual(['narration_answers']);
    const flagging = { ...told, nodes: told.nodes.map((n) => (n.id === 'still' ? { ...n, set: { lit: true } } : n)) };
    expect(codes({ ...flagging, chapters: [{ level: 1, node: 'once' }] })).toEqual(['narration_flags']);
  });

  it('reads a story told without people: chapters and an ending, no talks', () => {
    const r = validateDialogue(DialogueFile.parse({ version: 1, nodes: [{ id: 'once', speaker: 'narrator', lines: ['Once.'] }, { id: 'end', speaker: 'narrator', lines: ['The end.'] }], chapters: [{ level: 1, node: 'once' }], endings: [{ id: 'end', title: 'The End', node: 'end' }] }));
    expect(r.issues).toEqual([]);
  });

  it('warns of talks for someone the game does not have', () => {
    const r = validateDialogue(DialogueFile.parse(STORY), { speakers: ['hermit'] });
    expect([r.ok, r.issues.map((i) => `${i.severity}:${i.code}`)]).toEqual([true, ['warning:start_nobody']]);
  });
});

describe('checkStory', () => {
  const facts = { speakers: ['keeper'], events: ['death', 'custom:light'], types: ['warden'], levels: 2 };
  const story = (more: object) => DialogueFile.parse({ ...STORY, ...more });
  const codes = (more: object, f = facts) => checkStory(story(more), f).issues.map((i) => i.code).sort();

  it('passes a story the game can tell', () => {
    expect(codes({ deeds: [...STORY.deeds, { on: 'death', type: 'warden', set: { 'warden-down': true } }], chapters: [{ level: 2, title: 'The End' }] })).toEqual([]);
  });

  it('holds it to the game: people it places, events it emits, types it has, levels it has', () => {
    expect(codes({}, { ...facts, speakers: [] })).toEqual(['speaker_unplaced']);
    expect(codes({ deeds: [{ on: 'custom:light', set: { lit: true } }, { on: 'custom:ring', set: { rung: true } }] })).toEqual(['deed_event_unknown']);
    expect(codes({ deeds: [...STORY.deeds, { on: 'death', type: 'dragon', set: { slain: true } }] })).toEqual(['deed_type_unknown']);
    expect(codes({ chapters: [{ level: 3, title: 'Beyond' }] })).toEqual(['chapter_beyond']);
  });
});
