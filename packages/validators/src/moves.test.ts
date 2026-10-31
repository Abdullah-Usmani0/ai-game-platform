import { MoveSet, type BehaviourFsm } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { validateBehaviour } from './behaviour.js';
import { MIN_TELEGRAPH_TICKS, movesOfBehaviour, validateMoves, type MoveOwners } from './moves.js';

const cut = { id: 'cut', owner: 'player', anim: 'attack1', input: 'attack', startup: 6, active: 3, recovery: 10, hitboxes: [{ from: 0, to: 2, x: 4, y: -36, w: 30, h: 28 }], damage: 1, knockback: { x: 140, y: -60 }, hitstun: 12, hitstop: 3, cancels: [{ into: ['cut2'], from: 7, to: 16 }] };
const cut2 = { ...cut, id: 'cut2', anim: 'attack2', cancels: [] };
const claw = { id: 'claw', owner: 'ghoul', anim: 'claw', startup: 18, active: 4, recovery: 16, hitboxes: [{ from: 0, to: 3, x: 6, y: -24, w: 20, h: 16 }], damage: 1, knockback: { x: 160, y: -80 }, hitstun: 20, hitstop: 4 };
const spit = { id: 'spit', owner: 'gargoyle', anim: 'aim', startup: 30, active: 1, recovery: 20, hitboxes: [], damage: 1, knockback: { x: 0, y: 0 }, hitstun: 0, hitstop: 0, projectile: { type: 'ember', at: 30, speed: 150 } };
const owners: MoveOwners = { types: ['ghoul', 'gargoyle', 'ember'], clips: { player: ['attack1', 'attack2', 'attack3'], ghoul: ['walk', 'run', 'claw'], gargoyle: ['idle', 'aim'] } };
const codes = (moves: unknown[], o: MoveOwners = owners) => validateMoves(MoveSet.parse({ version: 1, moves }), o).issues.map((i) => i.code);

describe('validateMoves', () => {
  it("passes the hero's chain and foes that telegraph, and reports the shortest telegraph", () => {
    const r = validateMoves(MoveSet.parse({ version: 1, moves: [cut, cut2, claw, spit] }), owners);
    expect(r.issues).toEqual([]);
    expect(r.metrics).toEqual({ moves: 4, heroMoves: 2, shortestTelegraph: 18 });
  });

  it("holds every foe's blow to a wind-up of 150 ms; the hero's own swings may be quick", () => {
    expect(MIN_TELEGRAPH_TICKS).toBe(9);
    expect(codes([cut, cut2, { ...claw, startup: 8 }])).toEqual(['telegraph_short']);
    expect(codes([cut, cut2, { ...claw, startup: 9 }])).toEqual([]);
    expect(codes([{ ...cut, startup: 2, cancels: [] }])).toEqual([]);
    // A shove that deals nothing needs no telegraph.
    expect(codes([cut, cut2, { ...claw, startup: 4, damage: 0 }])).toEqual([]);
  });

  it('opens a chain only once a move has begun to hit', () => {
    expect(codes([{ ...cut, cancels: [{ into: ['cut2'], from: 3, to: 16 }] }, cut2])).toEqual(['cancel_early']);
  });

  it('knows each owner, its clips and its shots, and gives each move a clip of its own', () => {
    expect(codes([cut, cut2, { ...claw, owner: 'wraith' }])).toEqual(['move_owner_unknown']);
    expect(codes([cut, cut2, { ...claw, anim: 'bite' }])).toEqual(['move_clip_missing']);
    expect(codes([cut, cut2, { ...spit, projectile: { type: 'bolt', at: 30, speed: 150 } }])).toEqual(['unknown_projectile']);
    expect(codes([cut, { ...cut2, anim: 'attack1' }])).toEqual(['move_clip_shared']);
    // Without the game's types and clips, only the rules of the moves themselves apply.
    expect(codes([cut, cut2, { ...claw, owner: 'wraith', anim: 'bite' }], {})).toEqual([]);
  });

  it('warns of a blow with nothing to land it, and of a hero with no move on the attack key', () => {
    expect(codes([cut, cut2, { ...claw, hitboxes: [] }])).toEqual(['move_harmless']);
    expect(codes([{ ...cut, input: 'air', cancels: [] }])).toEqual(['no_attack']);
  });
});

describe('a behaviour that makes moves', () => {
  // Lurches at the player and, in reach, claws: the claw (18 + 4 + 16 ticks) is over 650 ms after the state is entered.
  const ghoul = (claw: BehaviourFsm['states'][string]): BehaviourFsm => ({
    version: 1,
    id: 'ghoul',
    designNotes: '',
    initial: 'lurch',
    states: {
      lurch: { onEnter: [{ kind: 'play_anim', anim: 'run' }], update: [{ kind: 'move_toward_player', speed: 76 }], transitions: [{ to: 'claw', when: { kind: 'player_within', px: 30 } }] },
      claw,
    },
  });
  const set = MoveSet.parse({ version: 1, moves: [cut, cut2, claw] });
  const own = movesOfBehaviour(set, [{ type: 'ghoul', fsm: 'ghoul' }, { type: 'hound', fsm: 'hound' }], 'ghoul');
  const codes = (fsm: BehaviourFsm) => validateBehaviour(fsm, undefined, undefined, own).issues.map((i) => i.code);
  const enter = [{ kind: 'move_toward_player' as const, speed: 0 }, { kind: 'play_anim' as const, anim: 'claw' }];

  it('knows the moves of the types that run it', () => {
    expect(own.map((m) => m.id)).toEqual(['claw']);
    expect(movesOfBehaviour(set, [{ type: 'ghoul', fsm: 'ghoul' }], 'hound')).toEqual([]);
  });

  it('lets a state that plays a move\'s clip turn to face the player, and holds it still while the move carries it', () => {
    expect(codes(ghoul({ onEnter: enter, update: [], transitions: [{ to: 'lurch', when: { kind: 'timer_elapsed', ms: 700 } }] }))).toEqual([]);
    expect(codes(ghoul({ onEnter: enter, update: [{ kind: 'move_toward_player', speed: 76 }], transitions: [{ to: 'lurch', when: { kind: 'timer_elapsed', ms: 700 } }] }))).toEqual(['move_state_moves']);
    expect(codes(ghoul({ onEnter: enter, update: [{ kind: 'move_toward_player', speed: 0 }], transitions: [{ to: 'lurch', when: { kind: 'timer_elapsed', ms: 700 } }] }))).toEqual([]);
  });

  it('waits the move out before it leaves, but for a hit that breaks it off', () => {
    const leaving = (when: BehaviourFsm['states'][string]['transitions'][number]['when']) => codes(ghoul({ onEnter: enter, update: [], transitions: [{ to: 'lurch', when }] }));
    expect(leaving({ kind: 'timer_elapsed', ms: 300 })).toEqual(['move_cut_short']);
    expect(leaving({ kind: 'player_beyond', px: 100 })).toEqual(['move_cut_short']);
    expect(leaving({ kind: 'took_damage' })).toEqual([]);
    expect(leaving({ kind: 'any', of: [{ kind: 'took_damage' }, { kind: 'timer_elapsed', ms: 300 }] })).toEqual(['move_cut_short']);
    expect(leaving({ kind: 'any', of: [{ kind: 'took_damage' }, { kind: 'timer_elapsed', ms: 700 }] })).toEqual([]);
    expect(leaving({ kind: 'all', of: [{ kind: 'grounded' }, { kind: 'timer_elapsed', ms: 700 }] })).toEqual([]);
  });

  it('has nothing to say of a behaviour whose types make no moves', () => {
    expect(validateBehaviour(ghoul({ onEnter: enter, update: [{ kind: 'patrol', speed: 30 }], transitions: [{ to: 'lurch', when: { kind: 'timer_elapsed', ms: 100 } }] })).issues.map((i) => i.code)).toEqual([]);
  });
});
