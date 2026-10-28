// Generates content/levels/l01.json from a compact description so the layout is reviewable.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const W = 64;
const H = 23;
const grid = Array.from({ length: H }, () => Array(W).fill('.'));
const fill = (x0, y0, x1, y1, ch) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = ch;
};
fill(0, 20, W - 1, 22, '#'); // floor
for (const [a, b] of [[18, 19], [37, 38], [52, 53]]) {
  fill(a, 20, b, 21, '.');
  fill(a, 22, b, 22, '^'); // spikes at the bottom of each pit
}
fill(24, 19, 27, 19, '#'); // one-tile step
fill(30, 18, 30, 19, '#'); // two-tile wall: needs a held jump
fill(42, 15, 48, 15, '-'); // one-way platform
fill(62, 19, 62, 19, 'G'); // goal
grid[19][2] = 'S';
const rows = grid.map((r) => r.join(''));
const level = {
  version: 1,
  id: 'l01',
  name: 'First Steps',
  tileSize: 8,
  width: W,
  height: H,
  legend: { '.': 'air', '#': 'solid', '^': 'hazard', '-': 'oneway', G: 'goal', S: 'spawn' },
  rows,
  entities: [
    { type: 'walker', x: 12, y: 19, props: {} },
    { type: 'walker', x: 56, y: 19, props: {} },
    { type: 'coin', x: 10, y: 18, props: {} },
    { type: 'coin', x: 26, y: 17, props: {} },
    { type: 'coin', x: 44, y: 13, props: {} },
    { type: 'coin', x: 45, y: 13, props: {} },
    { type: 'coin', x: 46, y: 13, props: {} },
    { type: 'coin', x: 58, y: 18, props: {} },
  ],
  spawn: { x: 2, y: 19 },
  goal: { x: 62, y: 19 },
  ramp: { segment: 0, difficulty: 0.2 },
};
const out = fileURLToPath(new URL('../content/levels/l01.json', import.meta.url));
writeFileSync(out, JSON.stringify(level, null, 2) + '\n');
console.log('wrote', out);
