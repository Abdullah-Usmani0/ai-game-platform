import type { DialogueState } from './world.js';

/** A menu ignores picks for this many ticks after it opens (0.3 s), so a held or mashed key never chooses unread. */
export const MENU_GRACE_TICKS = 18;
/** Characters a line of dialogue types out a tick (120 a second). */
export const DIALOGUE_CHARS_PER_TICK = 2;

/** What reading needs of a talk or a narration: its lines, the line being read, how much of it shows, when it opened. */
export type Reading = Pick<DialogueState, 'lines' | 'line' | 'shown' | 'openedTick'>;

/**
 * One tick of reading. The typewriter runs; past the grace (MENU_GRACE_TICKS from when the node opened, so a mashed
 * key never skips one unread), a fresh press shows the line whole, and the next goes on to the following line. 'end'
 * once the last line, shown whole, is pressed on. Talks held in the sim and the narration the page plays before a
 * level both read through this, so they read the same.
 */
export function stepLines(d: Reading, tick: number, pressed: boolean): 'reading' | 'end' {
  const text = d.lines[d.line] ?? '';
  if (d.shown < text.length) d.shown = Math.min(text.length, d.shown + DIALOGUE_CHARS_PER_TICK);
  if (tick - d.openedTick < MENU_GRACE_TICKS || !pressed) return 'reading';
  if (d.shown < text.length) {
    d.shown = text.length;
    return 'reading';
  }
  if (d.line + 1 < d.lines.length) {
    d.line++;
    d.shown = 0;
    return 'reading';
  }
  return 'end';
}
