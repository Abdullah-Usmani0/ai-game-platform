import { GameToHost, type GameToHost as GameMsg, type HostToGame } from '@gg/schemas';

export type InitOptions = Omit<Extract<HostToGame, { type: 'init' }>, 'type'>;
type Listener = (msg: GameMsg) => void;

/**
 * Host side of the host<->game bridge. The iframe runs with an opaque origin
 * (`sandbox="allow-scripts"` only), so the handshake is: game posts `hello` on
 * window.postMessage, host verifies the source window, creates a MessageChannel
 * and sends `init` with one port; everything after that is on the port and
 * validated against the schema on both sides.
 */
export class BridgeHost {
  private port: MessagePort | null = null;
  private listeners = new Set<Listener>();
  private detach: (() => void) | null = null;

  constructor(
    private readonly iframe: HTMLIFrameElement,
    private readonly init: InitOptions,
  ) {}

  attach(): () => void {
    const onMessage = (ev: MessageEvent) => {
      if (!this.iframe.contentWindow || ev.source !== this.iframe.contentWindow) return;
      const parsed = GameToHost.safeParse(ev.data);
      if (!parsed.success || parsed.data.type !== 'hello') return;
      if (this.port) return; // duplicate hello from the retry loop; already connected
      const channel = new MessageChannel();
      this.port = channel.port1;
      this.port.onmessage = (e) => {
        const msg = GameToHost.safeParse(e.data);
        if (msg.success) this.emit(msg.data);
      };
      // Target origin must be '*': a sandboxed frame without allow-same-origin has origin "null".
      this.iframe.contentWindow.postMessage({ type: 'init', ...this.init }, '*', [channel.port2]);
      this.emit(parsed.data);
    };
    window.addEventListener('message', onMessage);
    this.detach = () => {
      window.removeEventListener('message', onMessage);
      this.port?.close();
      this.port = null;
    };
    return this.detach;
  }

  private emit(msg: GameMsg): void {
    for (const l of this.listeners) l(msg);
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  send(msg: HostToGame): boolean {
    if (!this.port) return false;
    this.port.postMessage(msg);
    return true;
  }

  get connected(): boolean {
    return this.port !== null;
  }
}
