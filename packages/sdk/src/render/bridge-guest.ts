import { BRIDGE_PROTOCOL, HostToGame, type GameToHost, type HostToGame as HostMsg } from '@gg/schemas';
import type { GameBuild } from './controller.js';

export type InitMessage = Extract<HostMsg, { type: 'init' }>;
type Handler = (msg: HostMsg) => void;

/**
 * Game side of the host<->iframe bridge. Posts `hello` to the parent, receives `init`
 * with a MessagePort, then talks only over that port. Standalone pages (no parent)
 * resolve to null so the game boots from query parameters instead.
 */
export class BridgeGuest {
  private port: MessagePort | null = null;
  private handlers = new Set<Handler>();

  constructor(private readonly build: GameBuild) {}

  get connected(): boolean {
    return this.port !== null;
  }

  /**
   * Hosts attach their listener after the frame starts loading (a server-rendered page hydrates later),
   * so `hello` is re-sent every 300 ms until `init` arrives or the timeout elapses.
   */
  connect(timeoutMs = 4000): Promise<InitMessage | null> {
    if (typeof window === 'undefined' || window.parent === window) return Promise.resolve(null);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        done = true;
        clearTimeout(timer);
        clearInterval(repeat);
        window.removeEventListener('message', onMessage);
      };
      const timer = setTimeout(() => {
        if (done) return;
        finish();
        resolve(null);
      }, timeoutMs);
      const onMessage = (ev: MessageEvent) => {
        if (done || ev.source !== window.parent) return;
        const parsed = HostToGame.safeParse(ev.data);
        if (!parsed.success || parsed.data.type !== 'init') return;
        const port = ev.ports[0];
        if (!port) return;
        finish();
        this.port = port;
        port.onmessage = (e) => this.dispatch(e.data);
        resolve(parsed.data);
      };
      window.addEventListener('message', onMessage);
      const hello: GameToHost = {
        type: 'hello',
        protocol: BRIDGE_PROTOCOL,
        gameId: this.build.gameId,
        versionId: this.build.versionId,
        engine: this.build.engine,
      };
      const sayHello = () => window.parent.postMessage(hello, '*');
      const repeat = setInterval(sayHello, 300);
      sayHello();
    });
  }

  private dispatch(data: unknown): void {
    const parsed = HostToGame.safeParse(data);
    if (!parsed.success) return;
    for (const h of this.handlers) h(parsed.data);
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(msg: GameToHost): void {
    this.port?.postMessage(msg);
  }
}
