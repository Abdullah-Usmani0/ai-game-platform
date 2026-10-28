/** Deterministic PRNG (sfc32). Every call is counted so snapshots can prove replay equality. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  calls = 0;

  constructor(public readonly seed: number) {
    const s = seed >>> 0;
    this.a = 0x9e3779b9 ^ s;
    this.b = 0x243f6a88 ^ (s * 0x85ebca6b);
    this.c = 0xb7e15162 ^ (s << 7);
    this.d = s | 1;
    for (let i = 0; i < 12; i++) this.next();
    this.calls = 0;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    this.calls++;
    return this.next() / 4294967296;
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(items.length)];
    if (item === undefined) throw new Error('Rng.pick on empty array');
    return item;
  }

  private next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }
}
