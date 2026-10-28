import { z } from 'zod';
import { Id } from './common.js';

/**
 * Behaviour-as-data. Conditions and actions are a closed vocabulary so a small
 * model can only choose and parameterise, never invent. One level of all/any
 * grouping is allowed; the schema is otherwise flat and non-recursive.
 */
export const LeafCondition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('always') }),
  z.object({ kind: z.literal('timer_elapsed'), ms: z.int().min(0).max(60000) }),
  z.object({ kind: z.literal('player_within'), px: z.int().min(1).max(2000) }),
  z.object({ kind: z.literal('player_beyond'), px: z.int().min(1).max(2000) }),
  z.object({ kind: z.literal('hp_below'), fraction: z.number().min(0).max(1) }),
  z.object({ kind: z.literal('hit_wall') }),
  z.object({ kind: z.literal('at_ledge') }),
  z.object({ kind: z.literal('grounded') }),
  z.object({ kind: z.literal('took_damage') }),
  z.object({ kind: z.literal('flag'), name: Id, is: z.boolean() }),
  z.object({ kind: z.literal('chance'), p: z.number().min(0).max(1) }),
]);
export type LeafCondition = z.infer<typeof LeafCondition>;

export const Condition = z.union([
  LeafCondition,
  z.object({ kind: z.literal('all'), of: z.array(LeafCondition).min(1).max(6) }),
  z.object({ kind: z.literal('any'), of: z.array(LeafCondition).min(1).max(6) }),
]);
export type Condition = z.infer<typeof Condition>;

export const Action = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idle') }),
  z.object({ kind: z.literal('patrol'), speed: z.number().min(0).max(600) }),
  z.object({ kind: z.literal('move_toward_player'), speed: z.number().min(0).max(600) }),
  z.object({ kind: z.literal('move_away_from_player'), speed: z.number().min(0).max(600) }),
  z.object({ kind: z.literal('jump'), vy: z.number().min(-1200).max(0) }),
  z.object({ kind: z.literal('set_velocity'), vx: z.number().min(-600).max(600), vy: z.number().min(-1200).max(1200) }),
  z.object({ kind: z.literal('shoot'), projectile: Id, speed: z.number().min(10).max(1200), cooldownMs: z.int().min(50).max(10000) }),
  z.object({ kind: z.literal('play_anim'), anim: Id }),
  z.object({ kind: z.literal('emit'), event: z.string().max(32) }),
  z.object({ kind: z.literal('set_flag'), name: Id, value: z.boolean() }),
  z.object({ kind: z.literal('turn_around') }),
  z.object({ kind: z.literal('damage_player'), amount: z.int().min(0).max(100) }),
  z.object({ kind: z.literal('despawn') }),
]);
export type Action = z.infer<typeof Action>;

export const FsmState = z.object({
  onEnter: z.array(Action).max(6).default([]),
  update: z.array(Action).max(4).default([]),
  transitions: z.array(z.object({ to: Id, when: Condition })).max(8).default([]),
});
export type FsmState = z.infer<typeof FsmState>;

export const BehaviourFsm = z
  .object({
    version: z.literal(1),
    id: Id,
    designNotes: z.string().max(400).default(''),
    initial: Id,
    states: z.record(Id, FsmState),
  })
  .superRefine((fsm, ctx) => {
    const names = Object.keys(fsm.states);
    if (!names.includes(fsm.initial)) {
      ctx.addIssue({ code: 'custom', message: `initial state '${fsm.initial}' not defined`, path: ['initial'] });
    }
    for (const [name, st] of Object.entries(fsm.states)) {
      for (const t of st.transitions) {
        if (!names.includes(t.to)) {
          ctx.addIssue({ code: 'custom', message: `state '${name}' transitions to unknown '${t.to}'`, path: ['states', name] });
        }
      }
    }
  });
export type BehaviourFsm = z.infer<typeof BehaviourFsm>;

/** Event-condition-action rule: on <event>, if <conditions>, do <actions>. */
export const EcaRule = z.object({
  version: z.literal(1),
  id: Id,
  designNotes: z.string().max(400).default(''),
  on: z.string().max(32),
  if: z.array(LeafCondition).max(6).default([]),
  do: z.array(Action).min(1).max(6),
});
export type EcaRule = z.infer<typeof EcaRule>;
