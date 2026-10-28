import { emptyInput, type InputState } from '../sim/input.js';

/** Keyboard bindings: arrows/WASD move, Z/Space/C jump, X/Shift dash, E/Enter action, Esc/P pause. */
const BINDINGS: Record<string, keyof InputState> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyZ: 'jump',
  Space: 'jump',
  KeyC: 'jump',
  KeyX: 'dash',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyE: 'action',
  Enter: 'action',
  Escape: 'pause',
  KeyP: 'pause',
};

/** Tracks raw key state from DOM events; sampled once per tick by the driver. */
export class Keyboard {
  private state = emptyInput();
  private readonly onDown = (e: KeyboardEvent) => this.set(e.code, true, e);
  private readonly onUp = (e: KeyboardEvent) => this.set(e.code, false, e);

  attach(target: Window): void {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', () => {
      this.state = emptyInput();
    });
  }

  detach(target: Window): void {
    target.removeEventListener('keydown', this.onDown);
    target.removeEventListener('keyup', this.onUp);
  }

  private set(code: string, down: boolean, e: KeyboardEvent): void {
    const key = BINDINGS[code];
    if (!key) return;
    this.state[key] = down;
    e.preventDefault();
  }

  read(): InputState {
    return { ...this.state };
  }
}
