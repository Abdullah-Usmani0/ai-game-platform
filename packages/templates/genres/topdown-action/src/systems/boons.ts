import { defineSystem, type Entity, type MenuOption } from '@gg/sdk';

/** A boon: what its card says, how many times it can be taken, and what taking it does to the player. */
export interface Boon extends MenuOption {
  max: number;
  apply(p: Entity): void;
}

const num = (p: Entity, key: string, base: number): number => (typeof p.props[key] === 'number' ? (p.props[key] as number) : base);
const add = (p: Entity, key: string, by: number): void => {
  p.props[key] = num(p, key, 0) + by;
};
const scale = (p: Entity, key: string, by: number): void => {
  p.props[key] = Math.round(num(p, key, 1) * by * 1000) / 1000;
};

/** The props they write are the ones melee-attack and movement-topdown read; the controller carries them to the next floor. */
export const BOONS: readonly Boon[] = [
  { id: 'ember', label: 'Ember Blade', detail: 'Strikes deal one more damage.', icon: 'flame', max: 3, apply: (p) => add(p, 'atkBonus', 1) },
  { id: 'reach', label: 'Long Reach', detail: 'Strikes reach a third further.', icon: 'sword', max: 2, apply: (p) => scale(p, 'reachMul', 1.33) },
  { id: 'swift', label: 'Swift Hands', detail: 'Strike again much sooner.', icon: 'clock', max: 2, apply: (p) => scale(p, 'cdMul', 0.75) },
  { id: 'gale', label: 'Gale Step', detail: 'Dash again much sooner.', icon: 'foot', max: 2, apply: (p) => scale(p, 'dashCdMul', 0.6) },
  { id: 'heavy', label: 'Heavy Blows', detail: 'Strikes throw foes far back.', icon: 'hammer', max: 2, apply: (p) => scale(p, 'knockMul', 1.6) },
  {
    id: 'heart',
    label: 'Stout Heart',
    detail: 'Two more hearts, filled.',
    icon: 'heart',
    max: 2,
    apply: (p) => {
      add(p, 'maxHpBonus', 2);
      p.maxHp += 2;
      p.hp = Math.min(p.maxHp, p.hp + 2);
    },
  },
  {
    id: 'mend',
    label: 'Second Wind',
    detail: 'Heal every heart.',
    icon: 'heart',
    max: 99,
    apply: (p) => {
      p.hp = p.maxHp;
    },
  },
];

interface BoonsState {
  /** This floor has a boss: clearing it ends the run's act, so no boon is offered. */
  bossFloor: boolean;
  offered: string[];
}

/**
 * Hades-style boons: clearing a floor offers three, drawn by the seeded rng from those not yet taken to their limit
 * (healing only when hurt). The chosen boon changes the player's props, which the controller carries to the next floor,
 * so a run grows stronger floor by floor. The HUD counts the boons taken.
 */
export const boons = defineSystem<BoonsState>({
  id: 'boons',
  init(ctx) {
    const w = ctx.world;
    const p = w.player;
    // Hearts granted on earlier floors come back with the carried props.
    const bonus = num(p, 'maxHpBonus', 0);
    if (bonus > 0) {
      p.maxHp += bonus;
      p.hp = p.maxHp;
    }
    const taken = BOONS.reduce((n, b) => n + num(p, `boon_${b.id}`, 0), 0);
    if (taken > 0) w.hud['boons'] = taken;
    return { bossFloor: w.entities.some((e) => e.flags['boss']), offered: [] };
  },
  fixedUpdate() {},
  onEvent(s, ev, ctx) {
    const p = ctx.world.player;
    if (ev.name === 'custom:room_clear' && ctx.params['enabled'] !== false && !s.bossFloor && p.alive) {
      const stacks = (id: string) => num(p, `boon_${id}`, 0);
      const pool = BOONS.filter((b) => stacks(b.id) < b.max && !(b.id === 'mend' && p.hp >= p.maxHp));
      // Three different boons, drawn without replacement from the seeded rng: a replay offers the same three.
      const rest = [...pool];
      const picks: Boon[] = [];
      while (picks.length < 3 && rest.length > 0) picks.push(rest.splice(ctx.rng.int(rest.length), 1)[0]!);
      s.offered = picks.map((b) => b.id);
      // A boon taken before shows the level it would reach (Ember Blade II).
      const level = (b: Boon) => (stacks(b.id) > 0 && b.max > 1 && b.max < 99 ? ` ${['II', 'III', 'IV', 'V'][stacks(b.id) - 1] ?? ''}` : '');
      ctx.openMenu({ id: 'boon', title: 'Choose a boon', options: picks.map((b) => ({ id: b.id, label: `${b.label}${level(b)}`, detail: b.detail, icon: b.icon })) });
      return;
    }
    if (ev.name === 'menu_choose' && ev.payload['menu'] === 'boon') {
      const b = BOONS.find((x) => x.id === ev.payload['option'] && s.offered.includes(x.id));
      if (!b) return;
      b.apply(p);
      add(p, `boon_${b.id}`, 1);
      s.offered = [];
      ctx.world.hud['boons'] = BOONS.reduce((n, x) => n + num(p, `boon_${x.id}`, 0), 0);
      ctx.emit('custom:boon', { boon: b.id, taken: ctx.world.hud['boons'] });
    }
  },
});

export const meta = {
  id: 'boons',
  genres: ['topdown-action', 'roguelike'],
  required: false,
  summary: 'Clearing a floor offers a choice of three boons (damage, reach, attack speed, dash, knockback, hearts, healing); the chosen one carries into the next floor.',
  params: { enabled: { type: 'boolean', default: true, affects: 'none' } },
  emits: ['menu_open', 'custom:boon'],
  feedbackFor: ['custom:boon'],
} as const;
