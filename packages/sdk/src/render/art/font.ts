import type { RGB } from './color.js';
import { PixelCanvas, type Template } from './pixels.js';

/**
 * The built-in pixel font: 5x7 capitals with tabular digits (counters do not jitter) and proportional letters and
 * punctuation. Lower case prints as capitals; anything without a glyph prints as '?'.
 */
export const GLYPH_H = 7;

const G: Record<string, Template> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  ',': ['..', '..', '..', '..', '..', '.#', '#.'],
  ':': ['.', '#', '.', '.', '.', '#', '.'],
  ';': ['..', '.#', '..', '..', '..', '.#', '#.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '"': ['#.#', '#.#', '...', '...', '...', '...', '...'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
  '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
  '=': ['....', '....', '####', '....', '####', '....', '....'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '×': ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  '·': ['.', '.', '.', '#', '.', '.', '.'],
};

const DIGITS = new Set('0123456789');
const SPACE_W = 3;

function glyphOf(ch: string): Template {
  return G[ch] ?? G[ch.toUpperCase()] ?? G['?']!;
}

/** Columns a glyph spans once its empty edges are trimmed (digits keep their full width so counters line up). */
function span(ch: string): { from: number; width: number } {
  const t = glyphOf(ch);
  const w = Math.max(...t.map((r) => r.length));
  if (DIGITS.has(ch)) return { from: 0, width: w };
  let from = w;
  let to = -1;
  for (const row of t) {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') {
        from = Math.min(from, x);
        to = Math.max(to, x);
      }
    }
  }
  return to < 0 ? { from: 0, width: 1 } : { from, width: to - from + 1 };
}

/** Width in pixels of a line of text at scale 1 (one pixel between glyphs). */
export function measure(text: string): number {
  let w = 0;
  for (const ch of text) w += (ch === ' ' ? SPACE_W : span(ch).width) + 1;
  return Math.max(0, w - 1);
}

/**
 * A row of texts shortened to fit `room` pixels, each text also taking `extra[i]` (its icon and the gap after it): a
 * letter at a time comes off the longest word of the widest text, which then ends in a dot, down to three letters a
 * word. A row that fits comes back as it was.
 */
export function fitRow(texts: readonly string[], room: number, extra: readonly number[] = []): string[] {
  const out = [...texts];
  const bare = (w: string) => w.replace(/\.$/, '');
  const width = () => out.reduce((w, t, i) => w + measure(t) + (extra[i] ?? 0), 0);
  while (width() > room) {
    let widest = -1;
    let word = -1;
    out.forEach((t, i) => {
      if (widest >= 0 && measure(t) <= measure(out[widest]!)) return;
      const words = t.split(' ');
      let k = 0;
      for (let j = 1; j < words.length; j++) if (bare(words[j]!).length > bare(words[k]!).length) k = j;
      if (bare(words[k]!).length > 3) {
        widest = i;
        word = k;
      }
    });
    if (widest < 0) break;
    const words = out[widest]!.split(' ');
    words[word] = `${bare(words[word]!).slice(0, -1)}.`;
    out[widest] = words.join(' ');
  }
  return out;
}

/** Greedy word wrap into lines no wider than `maxWidth` pixels at scale 1; a word wider than that gets a line of its own. */
export function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export interface TextOptions {
  color: RGB;
  /** Pixel size of one font pixel. */
  scale?: number;
  /** Second colour for the lower half of each glyph (a subtle vertical gradient on titles). */
  lower?: RGB;
}

/** Paints a line of text with its top-left at (x, y). */
export function drawText(pc: PixelCanvas, text: string, x: number, y: number, opts: TextOptions): void {
  const s = opts.scale ?? 1;
  let cx = x;
  for (const ch of text) {
    if (ch === ' ') {
      cx += (SPACE_W + 1) * s;
      continue;
    }
    const t = glyphOf(ch);
    const { from, width } = span(ch);
    t.forEach((row, gy) => {
      for (let gx = from; gx < from + width; gx++) {
        if (row[gx] !== '#') continue;
        const c = opts.lower && gy >= Math.ceil(GLYPH_H / 2) ? opts.lower : opts.color;
        pc.fillRect(cx + (gx - from) * s, y + gy * s, s, s, c);
      }
    });
    cx += (width + 1) * s;
  }
}

/** A text image: padded by one pixel and outlined in ink so it reads over any background. */
export function textImage(text: string, opts: TextOptions & { ink: RGB }): PixelCanvas {
  const s = opts.scale ?? 1;
  const pc = new PixelCanvas(measure(text) * s + 2, GLYPH_H * s + 2);
  drawText(pc, text, 1, 1, opts);
  pc.outline('dark', opts.ink);
  return pc;
}

export const GLYPHS: Readonly<Record<string, Template>> = G;
