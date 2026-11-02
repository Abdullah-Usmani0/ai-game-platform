import { DialogueFile, flagsHold } from '@gg/schemas';
import { centerX, centerY, defineSystem } from '@gg/sdk';

/**
 * The keys talking can be set to: up by default (a side view's; the castle's); down in a side view whose up is taken;
 * top-down, where the arrows walk, jump, dash or action, whichever the game uses for nothing else.
 */
export const TALK_KEYS = ['up', 'down', 'jump', 'dash', 'action'] as const;
export type TalkKey = (typeof TALK_KEYS)[number];

interface TalkState {
  /** The key was held on the step before: a talk takes a fresh press, and a key held as the level loads is not one. */
  prev: boolean;
  /** The last tick this system ran: a gap is a talk being read or a menu, after which a key still held is no press. */
  lastTick: number;
  /** The game's dialogue, or null when it has none (then nobody talks). */
  file: DialogueFile | null;
}

/**
 * The game's people talk: the key (up unless the game sets another) beside someone (an entity marked npc) opens the
 * first of their talks whose flags hold (content/dialogue.json: they talk as their `speaker` prop, else their type). The
 * two turn to face each other, and the world holds still while the player reads (custom:talk); what the talk sets lands
 * on the player as `f:` flags. A key still held from a talk just read or a menu just closed opens nothing.
 */
export const talk = defineSystem<TalkState>({
  id: 'talk',
  init: (ctx) => {
    const parsed = DialogueFile.safeParse(ctx.content['dialogue']);
    return { prev: true, lastTick: -2, file: parsed.success ? parsed.data : null };
  },
  fixedUpdate(s, input, ctx) {
    const key = (TALK_KEYS as readonly string[]).includes(String(ctx.params['key'])) ? (String(ctx.params['key']) as TalkKey) : 'up';
    const held = input[key] === true;
    // After a talk or a menu this system did not see, a key still held from it is not a new press.
    const press = held && !s.prev && ctx.tick === s.lastTick + 1;
    s.prev = held;
    s.lastTick = ctx.tick;
    const p = ctx.world.player;
    if (!press || !s.file || !p.alive) return;
    const reach = Number(ctx.params['reach'] ?? 10);
    const npc = ctx.world.entities.find((e) => e.alive && e.flags['npc'] === true && Math.abs(centerX(e) - centerX(p)) <= e.w / 2 + p.w / 2 + reach && Math.abs(centerY(e) - centerY(p)) <= e.h / 2 + reach);
    if (!npc) return;
    const speaker = typeof npc.props['speaker'] === 'string' ? npc.props['speaker'] : npc.type;
    const start = s.file.starts.find((st) => st.speaker === speaker && flagsHold(st.when, p.props));
    if (!start || !ctx.openDialogue(start.node)) return;
    p.facing = centerX(npc) < centerX(p) ? -1 : 1;
    npc.facing = -p.facing;
    p.vx = 0;
    ctx.emit('custom:talk', { entity: npc.id, speaker, node: start.node });
  },
});

/** The castle's people: up beside them, as its rest beside an altar. */
export const meta = {
  id: 'talk',
  genres: ['castle'],
  summary: "The game's people talk: up beside someone opens the first of their talks whose flags hold (content/dialogue.json); the world holds while the player reads, and what is said can set the story's flags.",
  params: {
    reach: { type: 'number', min: 2, max: 32, default: 10, affects: 'none' },
  },
  emits: ['custom:talk'],
  feedbackFor: ['custom:talk'],
  controls: { up: 'talk to someone' },
  // Up talks only beside someone, so it shares the key with a rest beside an altar.
  sharedControls: ['up'],
  hud: [],
} as const;

/**
 * People in a composed game, on any base the player walks or runs and jumps on: the talk places them in the levels (its
 * `people`: who, in which level, near its start, middle or end) and the key beside one opens their talk. The key is the
 * game's to choose from those its movement leaves free: up or down in a side view (the arrows walk top-down), jump, dash
 * or action top-down. It reads the key only beside someone, so another use beside something of its own may share it.
 */
export const blockMeta = {
  id: 'talk',
  genres: ['freeform'],
  summary:
    "People to talk to: the story's talk (content/dialogue.json) places them in the levels (its people: a speaker, a level, near its start, middle or end) and the key beside one opens the first of their talks whose flags hold; the world holds while the player reads, and answers can set the story's flags. key: up or down in a side view; jump, dash or action top-down (one no other system of the game uses).",
  params: {
    key: { type: 'string', values: TALK_KEYS, default: 'up', affects: 'none', valuesWith: { platformer: ['up', 'down'], topdown: ['jump', 'dash', 'action'] } },
    reach: { type: 'number', min: 2, max: 32, default: 10, affects: 'none' },
    personType: { type: 'string', default: 'person', affects: 'none', composed: 'entity' },
  },
  emits: ['custom:talk'],
  feedbackFor: ['custom:talk'],
  controls: { up: 'talk to someone', down: 'talk to someone', jump: 'talk to someone', dash: 'talk to someone', action: 'talk to someone' },
  controlGates: {
    up: { param: 'key', values: ['up'] },
    down: { param: 'key', values: ['down'] },
    jump: { param: 'key', values: ['jump'] },
    dash: { param: 'key', values: ['dash'] },
    action: { param: 'key', values: ['action'] },
  },
  sharedControls: ['up', 'down', 'jump', 'dash', 'action'],
  requires: { movement: ['topdown', 'platformer'] },
  hud: [],
} as const;
