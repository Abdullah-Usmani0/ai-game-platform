/** Rolling frame-time metrics for budgets and the bridge `metrics` message. */
export class Metrics {
  private deltas: number[] = [];
  private readonly cap = 240;

  record(deltaMs: number): void {
    this.deltas.push(deltaMs);
    if (this.deltas.length > this.cap) this.deltas.shift();
  }

  snapshot(): { fps: number; frameMsP95: number; frameMsAvg: number; heapMB: number; samples: number } {
    const n = this.deltas.length;
    if (n === 0) return { fps: 0, frameMsP95: 0, frameMsAvg: 0, heapMB: heapMB(), samples: 0 };
    const sorted = [...this.deltas].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / n;
    const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))] ?? avg;
    return { fps: avg > 0 ? 1000 / avg : 0, frameMsP95: p95, frameMsAvg: avg, heapMB: heapMB(), samples: n };
  }
}

function heapMB(): number {
  const perf = globalThis.performance as Performance & { memory?: { usedJSHeapSize: number } };
  const used = perf?.memory?.usedJSHeapSize;
  return typeof used === 'number' ? Math.round((used / 1048576) * 10) / 10 : 0;
}
