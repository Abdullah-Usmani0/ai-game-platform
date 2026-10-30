import { describe, expect, it } from 'vitest';
import { Keyboard } from './keyboard.js';

/** Presses a key the way the browser reports it. */
function press(kb: Keyboard, code: string): void {
  let listener: ((e: KeyboardEvent) => void) | undefined;
  const target = { addEventListener: (type: string, fn: (e: KeyboardEvent) => void) => (type === 'keydown' ? (listener = fn) : undefined), removeEventListener() {} } as unknown as Window;
  kb.attach(target);
  listener!({ code, preventDefault() {} } as KeyboardEvent);
}

describe('keyboard', () => {
  it('binds guard and item only for a game that reads them', () => {
    const plain = new Keyboard();
    press(plain, 'KeyQ');
    expect(plain.read().guard).toBeUndefined();
    const castle = new Keyboard(['guard', 'item']);
    press(castle, 'KeyQ');
    press(castle, 'KeyF');
    expect(castle.read()).toMatchObject({ guard: true, item: true });
    press(castle, 'KeyZ');
    expect(castle.read().jump).toBe(true);
  });
});
