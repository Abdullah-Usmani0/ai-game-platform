import { DialogueFile, flagsHold } from '@gg/schemas';
import { centerX, centerY, defineSystem } from '@gg/sdk';

interface TalkState {
  /** Up on the step before: a talk takes a fresh press, and a key held as the level loads is not one. */
  prev: boolean;
  /** The game's dialogue, or null when it has none (then nobody talks). */
  file: DialogueFile | null;
}

/**
 * The game's people talk: pressing up beside someone (an entity marked npc) opens the first of their talks whose flags
 * hold (content/dialogue.json: they talk as their `speaker` prop, else their type). The two turn to face each other, and
 * the world holds still while the player reads (custom:talk); what the talk sets lands on the player as `f:` flags.
 */
export const talk = defineSystem<TalkState>({
  id: 'talk',
  init: (ctx) => {
    const parsed = DialogueFile.safeParse(ctx.content['dialogue']);
    return { prev: true, file: parsed.success ? parsed.data : null };
  },
  fixedUpdate(s, input, ctx) {
    const press = input.up && !s.prev;
    s.prev = input.up;
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
