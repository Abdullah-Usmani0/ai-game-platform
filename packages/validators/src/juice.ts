import type { GameEventRecord, GddFrontmatter } from '@gg/schemas';
import { err, report, warn, type Issue, type ValidationReport } from './report.js';

export interface JuiceClamps {
  /** Max ticks between a gameplay event and its first feedback/audio event. */
  feedbackWindowTicks: number;
  /** Ticks of silence allowed at the start of a run before the first audio event. */
  silentStartTicks: number;
  /** Max feedback events of one channel per tick before it counts as a pile-up. */
  maxPerTick: number;
}

export const DEFAULT_CLAMPS: JuiceClamps = { feedbackWindowTicks: 6, silentStartTicks: 600, maxPerTick: 4 };

/**
 * Event-based juice lint over a recorded playtest event history. Proves feedback at runtime:
 * every occurrence of a GDD feedback event must be followed within the window by a `feedback`
 * (with one of its declared channels) or `audio_play` event. Also checks pile-ups and silent starts.
 */
export function juiceLint(events: readonly GameEventRecord[], gdd: Pick<GddFrontmatter, 'feedbackEvents'>, clamps: JuiceClamps = DEFAULT_CLAMPS): ValidationReport {
  const issues: Issue[] = [];
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.name] = (counts[e.name] ?? 0) + 1;
  const feedbackByTick = new Map<number, GameEventRecord[]>();
  for (const e of events) {
    if (e.name !== 'feedback' && e.name !== 'audio_play') continue;
    const arr = feedbackByTick.get(e.tick) ?? [];
    arr.push(e);
    feedbackByTick.set(e.tick, arr);
  }
  let unbound = 0;
  for (const fe of gdd.feedbackEvents) {
    const occurrences = events.filter((e) => e.name === fe.event);
    if (occurrences.length === 0) {
      issues.push(warn('event_never_fired', `feedback event '${fe.event}' never occurred in this run`));
      continue;
    }
    let misses = 0;
    for (const occ of occurrences) {
      let found = false;
      for (let t = occ.tick; t <= occ.tick + clamps.feedbackWindowTicks && !found; t++) {
        for (const f of feedbackByTick.get(t) ?? []) {
          if (f.name === 'audio_play' && fe.channels.includes('sfx')) found = true;
          if (f.name === 'feedback' && fe.channels.includes(String(f.payload['channel']) as (typeof fe.channels)[number])) found = true;
        }
      }
      if (!found) misses++;
    }
    if (misses > 0) {
      unbound++;
      issues.push(err('feedback_missing', `'${fe.event}' fired ${occurrences.length}x but ${misses}x had no ${fe.channels.join('/')} feedback within ${clamps.feedbackWindowTicks} ticks`));
    }
  }
  for (const [tick, arr] of feedbackByTick) {
    const perChannel: Record<string, number> = {};
    for (const f of arr) {
      const ch = f.name === 'audio_play' ? 'sfx' : String(f.payload['channel']);
      perChannel[ch] = (perChannel[ch] ?? 0) + 1;
      if (perChannel[ch]! > clamps.maxPerTick) {
        issues.push(warn('feedback_pileup', `${perChannel[ch]} '${ch}' feedback events on tick ${tick}`));
        break;
      }
    }
  }
  const firstAudio = events.find((e) => e.name === 'audio_play');
  const lastTick = events[events.length - 1]?.tick ?? 0;
  if (!firstAudio && lastTick >= clamps.silentStartTicks) issues.push(warn('silent_start', `no audio_play in the first ${clamps.silentStartTicks} ticks`));
  return report(issues, { events: events.length, feedbackEvents: counts['feedback'] ?? 0, audioEvents: counts['audio_play'] ?? 0, unboundEvents: unbound });
}
