import { SFX_PRESETS } from './art/audio.js';

/**
 * Plays the art kit's sound presets through WebAudio. The audio context starts on the player's first key or click
 * (browsers do not allow sound before a gesture), and the host can mute it.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  muted = false;

  /** Creates (or resumes) the audio context; call from a key or pointer handler. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.7;
    this.out.connect(ctx.destination);
    // One second of seeded white noise, shared by every noise voice.
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 22695477;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) | 0;
      data[i] = ((seed >>> 8) & 0xffff) / 32768 - 1;
    }
    this.noise = buf;
  }

  play(name: string): void {
    const ctx = this.ctx;
    const out = this.out;
    const voices = SFX_PRESETS[name];
    if (this.muted || !ctx || !out || ctx.state !== 'running' || !voices) return;
    // The same sound twice within 35 ms is one sound (a burst of pickups does not clip).
    const now = ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < 0.035) return;
    this.last.set(name, now);
    for (const v of voices) {
      const t0 = now + (v.delay ?? 0);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(v.vol, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur);
      gain.connect(out);
      if (v.wave === 'noise') {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(v.from, t0);
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, v.to), t0 + v.dur);
        src.connect(filter);
        filter.connect(gain);
        src.start(t0);
        src.stop(t0 + v.dur + 0.02);
      } else {
        const osc = ctx.createOscillator();
        osc.type = v.wave;
        osc.frequency.setValueAtTime(v.from, t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.to), t0 + v.dur);
        osc.connect(gain);
        osc.start(t0);
        osc.stop(t0 + v.dur + 0.02);
      }
    }
  }
}
