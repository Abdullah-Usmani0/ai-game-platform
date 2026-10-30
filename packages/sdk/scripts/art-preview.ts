// Renders the art kit (every sprite frame, terrain, font and palette) into a PNG sheet for review:
//   node --import tsx scripts/art-preview.ts <out.png> [palette.json]
import { writeFileSync } from 'node:fs';
import { artPalette, type PaletteRoles } from '../src/render/art/palette.js';
import { PixelCanvas } from '../src/render/art/pixels.js';
import { encodePng } from '../src/render/art/png.js';
import { RECIPES, paintFrames } from '../src/render/art/sprites.js';
import { drawText, textImage } from '../src/render/art/font.js';
import { readFileSync } from 'node:fs';

const [out = 'art-preview.png', palPath] = process.argv.slice(2);
const roles: PaletteRoles = palPath ? JSON.parse(readFileSync(palPath, 'utf8')) : { background: '#1b1b2f', mid: '#4f5d75', foreground: '#f2f2f2', accent: '#ffd166', danger: '#ef476f', ui: '#ffffff' };
const pal = artPalette(roles, (process.env['OUTLINE'] as never) ?? 'dark');

// Layout: one row per recipe (label, then its frames), then the font.
const only = process.env['ONLY']?.split(',');
const rows = Object.entries(RECIPES)
  .filter(([name]) => !only || only.includes(name))
  .map(([name, r]) => ({ name, frames: paintFrames(r, pal) }));
const cellW = Math.max(...rows.flatMap((r) => r.frames.map((f) => f.pc.w))) + 4;
const cellH = Math.max(...rows.flatMap((r) => r.frames.map((f) => f.pc.h))) + 4;
const labelW = 70;
const maxFrames = Math.max(...rows.map((r) => r.frames.length));
const fontLines = ['THE QUICK BROWN FOX JUMPS', 'OVER THE LAZY DOG 0123456789', 'SCORE 1250 · LEVEL 2/3 · HP 3', "!?.,:;'\"-+/()%#<>=_*×"];
const W = Math.max(labelW + maxFrames * cellW, 200) + 8;
const H = rows.length * cellH + fontLines.length * 10 + 30;
const sheet = new PixelCanvas(W, H);
sheet.fillRect(0, 0, W, H, pal.sky[0]);
rows.forEach((row, i) => {
  const y = i * cellH + 2;
  sheet.fillRect(0, y - 1, W, cellH - 2, i % 2 ? pal.sky[0] : pal.far);
  drawText(sheet, row.name.toUpperCase().slice(0, 11), 2, y + 2, { color: pal.ui[3] });
  row.frames.forEach((f, j) => sheet.blit(f.pc, labelW + j * cellW, y));
});
fontLines.forEach((line, i) => sheet.blit(textImage(line, { color: pal.white, ink: pal.ink }), 2, rows.length * cellH + 6 + i * 10));
// Palette swatches.
const sw = [pal.ink, ...pal.terrain, ...pal.rim, ...pal.hero, ...pal.accent, ...pal.danger, ...pal.wood, ...pal.floor];
sw.forEach((c, i) => sheet.fillRect(2 + i * 6, H - 10, 5, 8, c));
writeFileSync(out, encodePng(sheet, Number(process.env['SCALE'] ?? 6)));
console.log(`${out}: ${rows.length} recipes, ${rows.reduce((n, r) => n + r.frames.length, 0)} frames`);
