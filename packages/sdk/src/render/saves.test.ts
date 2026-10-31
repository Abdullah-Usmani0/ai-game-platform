import type { LevelJson } from '@gg/schemas';
import { describe, expect, it } from 'vitest';
import { readSaveBlob, saveBlob } from './saves.js';

const level = (id: string): LevelJson => ({
  version: 1,
  id,
  name: id,
  tileSize: 8,
  width: 12,
  height: 6,
  legend: { '.': 'air', '#': 'solid' },
  rows: ['############', '#..........#', '#..........#', '#..........#', '#..........#', '############'],
  entities: [{ type: 'coin', x: 3, y: 4, props: {} }],
  spawn: { x: 2, y: 3 },
  goal: { x: 9, y: 3 },
});
const levels = [level('a'), level('b')];
const save = { at: { x: 40, y: 20 }, facing: -1, props: { 'ab:dash': true, '_map:b': '10' }, removed: [0], tiles: [[4, 4, 'air']] };

describe('saves', () => {
  it('leaves a rest with the host, and picks the level up from it again', () => {
    const blob = saveBlob(1, 'b', save, { power: 2 }, 65536)!;
    expect(readSaveBlob(blob, levels)).toEqual({ level: 1, save, carry: { power: 2 } });
  });

  it('turns away a blob that is no save of this game, and a save too big for the host', () => {
    expect(readSaveBlob(undefined, levels)).toBeNull();
    expect(readSaveBlob('{', levels)).toBeNull();
    // Another version's levels, an entity the level never placed, a tile outside it.
    expect(readSaveBlob(saveBlob(1, 'b', save, {}, 65536)!, [level('a'), level('c')])).toBeNull();
    expect(readSaveBlob(saveBlob(0, 'a', { ...save, removed: [5] }, {}, 65536)!, levels)).toBeNull();
    expect(readSaveBlob(saveBlob(0, 'a', { ...save, tiles: [[40, 1, 'air']] }, {}, 65536)!, levels)).toBeNull();
    // What a rest announced that is no save, and a save over the host's limit.
    expect(saveBlob(1, 'b', { at: { x: 1 } }, {}, 65536)).toBeNull();
    expect(saveBlob(1, 'b', save, {}, 64)).toBeNull();
  });
});
