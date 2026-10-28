import type { FeedbackChannel, GameEventName } from '@gg/schemas';
import { defineSystem, type SystemDef } from './system.js';

export interface FeedbackBinding {
  event: GameEventName | string;
  channels: FeedbackChannel[];
}

/**
 * Turns the GDD's feedback table into runtime events: for every bound gameplay event the sim emits one
 * `feedback { channel }` per channel (and `audio_play` for sfx). The renderer executes channels; the juice
 * linter proves at playtest time that every bound event actually produced its feedback.
 */
export function feedbackBinder(bindings: FeedbackBinding[]): SystemDef<{ fired: number }> {
  const table = new Map<string, FeedbackChannel[]>();
  for (const b of bindings) table.set(b.event, [...new Set([...(table.get(b.event) ?? []), ...b.channels])]);
  return defineSystem<{ fired: number }>({
    id: 'feedback-binder',
    init: () => ({ fired: 0 }),
    fixedUpdate: () => {},
    onEvent(state, ev, ctx) {
      const channels = table.get(ev.name);
      if (!channels) return;
      for (const channel of channels) {
        state.fired++;
        ctx.emit('feedback', { channel, source: ev.name });
        if (channel === 'sfx') ctx.emit('audio_play', { source: ev.name, sfx: ev.name });
      }
    },
  });
}
