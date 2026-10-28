import type { GameEventRecord } from '@gg/schemas';

export type EventPayload = Record<string, unknown>;
export type EventHandler = (ev: GameEventRecord) => void;

/** Typed event bus with a bounded history ring. Semantic events are the oracle for bots and the juice linter. */
export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private anyHandlers = new Set<EventHandler>();
  private ring: GameEventRecord[] = [];
  private counts = new Map<string, number>();
  constructor(private readonly capacity = 2000) {}

  emit(tick: number, name: string, payload: EventPayload = {}): void {
    const rec: GameEventRecord = { tick, name, payload };
    this.ring.push(rec);
    if (this.ring.length > this.capacity) this.ring.shift();
    this.counts.set(name, (this.counts.get(name) ?? 0) + 1);
    const hs = this.handlers.get(name);
    if (hs) for (const h of hs) h(rec);
    for (const h of this.anyHandlers) h(rec);
  }

  on(name: string | '*', handler: EventHandler): () => void {
    if (name === '*') {
      this.anyHandlers.add(handler);
      return () => this.anyHandlers.delete(handler);
    }
    let hs = this.handlers.get(name);
    if (!hs) {
      hs = new Set();
      this.handlers.set(name, hs);
    }
    hs.add(handler);
    return () => hs?.delete(handler);
  }

  history(): readonly GameEventRecord[] {
    return this.ring;
  }

  count(name: string): number {
    return this.counts.get(name) ?? 0;
  }

  clear(): void {
    this.ring.length = 0;
    this.counts.clear();
  }
}
