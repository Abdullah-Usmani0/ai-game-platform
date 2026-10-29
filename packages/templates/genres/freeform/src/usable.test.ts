import { describe, expect, it } from 'vitest';
import { freeformDesignManifest } from './node.js';
import { FREEFORM_CATALOG, movementOf, usableSystems } from './registry.js';

describe('what a freeform game on a base can use', () => {
  it('every system that works with the base movement, and no other movement', () => {
    expect(movementOf('survivors')).toBe('topdown');
    expect(movementOf('puzzle')).toBe('grid');
    const topdown = usableSystems('topdown-action');
    expect(topdown).toEqual(expect.arrayContaining(['movement-topdown', 'melee-attack', 'auto-attack', 'player-shooter', 'room-clear', 'spawner', 'survival', 'pickups', 'objectives']));
    expect(topdown).not.toContain('movement-platformer');
    expect(topdown).not.toContain('combat-stomp');
    expect(topdown).not.toContain('grid-push');
    const platformer = usableSystems('platformer');
    expect(platformer).toEqual(expect.arrayContaining(['movement-platformer', 'movement-metroidvania', 'hazards', 'combat-stomp', 'relics', 'goal', 'objectives']));
    expect(platformer).not.toContain('melee-attack');
  });

  it('a design-time manifest offers them on the base genre, and the catalog knows every system', () => {
    const m = freeformDesignManifest('survivors');
    expect(m.id).toBe('freeform');
    expect(m.levelGrammar.kind).toBe('arena');
    expect(Object.keys(m.systems).sort()).toEqual(usableSystems('survivors').sort());
    expect(Object.keys(FREEFORM_CATALOG)).toEqual(expect.arrayContaining(['objectives', 'grid-push', 'melee-attack', 'relics']));
  });
});
