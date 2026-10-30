import { defineSystem } from '@gg/sdk';

/** Ticks the owl sleeps, stirs (a warning) and watches, in turn. */
const PHASES = [90, 40, 120] as const;
/** How far a watched moth may drift, in pixels, before it is seen. */
const LEEWAY = 1;

interface OwlState {
  phase: number;
  until: number;
  /** Where the moth was when the owl began to watch. */
  x: number;
  y: number;
  seen: number;
}

/**
 * Example: an owl watches the forest. It sleeps, stirs for a moment and watches, in turn (the HUD's owl reads 0, 1 and
 * 2). A moth that moves while it watches, by its own wings or knocked about, is seen: it flies back to where the level
 * began, and the owl settles to sleep again.
 */
export const owl = defineSystem<OwlState>({
  id: 'owl',
  init(ctx) {
    ctx.world.hud['owl'] = 0;
    return { phase: 0, until: PHASES[0], x: 0, y: 0, seen: 0 };
  },
  fixedUpdate(s, _input, ctx) {
    const p = ctx.world.player;
    if (ctx.tick >= s.until) {
      s.phase = (s.phase + 1) % PHASES.length;
      s.until = ctx.tick + PHASES[s.phase]!;
      ctx.world.hud['owl'] = s.phase;
      s.x = p.x;
      s.y = p.y;
    }
    if (s.phase !== 2 || !p.alive || (Math.abs(p.x - s.x) <= LEEWAY && Math.abs(p.y - s.y) <= LEEWAY)) return;
    s.seen++;
    ctx.emit('custom:seen', { x: p.x, y: p.y, seen: s.seen });
    ctx.respawnPlayer();
    s.phase = 0;
    s.until = ctx.tick + PHASES[0];
    ctx.world.hud['owl'] = 0;
  },
});
