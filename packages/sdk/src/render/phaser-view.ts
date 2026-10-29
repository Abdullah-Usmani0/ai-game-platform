import Phaser from 'phaser';
import type { Entity } from '../sim/world.js';
import type { GameController } from './controller.js';

export interface ViewStyle {
  canvas: { w: number; h: number };
  pixelArt: boolean;
  palette: { background: string; mid: string; foreground: string; accent: string; danger: string; ui: string };
  camera: { lerp: number; maxShake: number; deadzone: { w: number; h: number } };
}

function hex(color: string): number {
  return parseInt(color.replace('#', ''), 16);
}

const ENTITY_COLORS: Record<string, keyof ViewStyle['palette']> = {
  player: 'foreground',
  projectile: 'danger',
};

/** The only Phaser code in the SDK: draws the sim state, forwards frames, binds feedback. */
export class MainScene extends Phaser.Scene {
  private tiles!: Phaser.GameObjects.Graphics;
  private gfx!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private overlay!: Phaser.GameObjects.Text;
  private followTarget = { x: 0, y: 0 };
  private unsubs: Array<() => void> = [];
  private levelDirty = true;
  /** Tilemap version the tiles were last drawn at (doors opening change tiles at runtime). */
  private drawnVersion = -1;
  private hitstopUntil = 0;

  constructor(
    private readonly controller: GameController,
    private readonly style: ViewStyle,
    private readonly onCreated: () => void,
  ) {
    super('main');
  }

  create(): void {
    const { palette, canvas } = this.style;
    this.cameras.main.setBackgroundColor(palette.background);
    this.cameras.main.setRoundPixels(true);
    this.tiles = this.add.graphics();
    this.gfx = this.add.graphics();
    this.hud = this.add
      .text(2, 2, '', { fontFamily: 'monospace', fontSize: '8px', color: palette.ui })
      .setScrollFactor(0)
      .setDepth(10);
    this.overlay = this.add
      .text(canvas.w / 2, canvas.h / 2, '', { fontFamily: 'monospace', fontSize: '10px', color: palette.ui, align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(11);
    this.unsubs.push(this.controller.onLevelChange(() => this.bindLevel()));
    this.unsubs.push(this.controller.onSceneChange(() => this.refreshOverlay()));
    this.bindLevel();
    this.refreshOverlay();
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.controller.scene === 'title' && (e.code === 'Enter' || e.code === 'Space')) this.controller.setScene('play');
      else if (this.controller.scene === 'results' && (e.code === 'Enter' || e.code === 'Space')) this.controller.reset();
    });
    this.onCreated();
  }

  private bindLevel(): void {
    for (const u of this.unsubs.splice(2)) u();
    const sim = this.controller.sim;
    const map = sim.map;
    // A level smaller than the view sits in its middle: grow the bounds evenly around it instead of pinning it top-left.
    const cam = this.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const bw = Math.max(map.pixelWidth, viewW);
    const bh = Math.max(map.pixelHeight, viewH);
    cam.setBounds(-(bw - map.pixelWidth) / 2, -(bh - map.pixelHeight) / 2, bw, bh);
    const lerp = this.style.camera.lerp;
    this.cameras.main.startFollow(this.followTarget, true, lerp, lerp);
    this.cameras.main.setDeadzone(this.style.camera.deadzone.w, this.style.camera.deadzone.h);
    this.levelDirty = true;
    const maxShake = this.style.camera.maxShake;
    // The sim decides *that* feedback happens (feedback-binder); the view decides *how* each channel looks.
    this.unsubs.push(
      sim.events.on('feedback', (ev) => {
        const channel = String(ev.payload['channel']);
        if (channel === 'shake' && maxShake > 0) this.cameras.main.shake(120, 0.004 * maxShake);
        else if (channel === 'flash') this.cameras.main.flash(120, 255, 255, 255);
        else if (channel === 'hitstop') this.hitstopUntil = performance.now() + 50;
      }),
      sim.events.on('level_complete', () => this.refreshOverlay()),
    );
  }

  private refreshOverlay(): void {
    const scene = this.controller.scene;
    if (scene === 'title') this.overlay.setText(['', 'PRESS ENTER'].join('\n'));
    else if (scene === 'results') this.overlay.setText('ALL LEVELS CLEAR\nENTER TO RESTART');
    else this.overlay.setText('');
  }

  private drawTiles(): void {
    const map = this.controller.sim.map;
    const { palette } = this.style;
    const ts = map.tileSize;
    this.tiles.clear();
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const kind = map.kindAt(tx, ty);
        if (kind === 'air') continue;
        const color = kind === 'solid' ? palette.mid : kind === 'hazard' ? palette.danger : kind === 'goal' ? palette.accent : palette.mid;
        this.tiles.fillStyle(hex(color), kind === 'oneway' ? 0.6 : 1);
        if (kind === 'oneway') this.tiles.fillRect(tx * ts, ty * ts, ts, Math.max(1, ts / 4));
        else if (kind === 'hazard') this.tiles.fillRect(tx * ts + 1, ty * ts + ts / 2, ts - 2, ts / 2);
        else this.tiles.fillRect(tx * ts, ty * ts, ts, ts);
      }
    }
    this.levelDirty = false;
    this.drawnVersion = map.version;
  }

  private colorFor(e: Entity): number {
    const key = e.tint ?? ENTITY_COLORS[e.type] ?? (e.pickup ? 'accent' : 'danger');
    return hex(this.style.palette[key]);
  }

  override update(_time: number, delta: number): void {
    // Hitstop is a render-side pause: realtime frames are skipped while it lasts; manual stepping is unaffected.
    if (performance.now() < this.hitstopUntil && this.controller.mode === 'realtime') {
      this.controller.metrics.record(delta);
      return;
    }
    this.controller.frame(delta);
    if (this.levelDirty || this.controller.sim.map.version !== this.drawnVersion) this.drawTiles();
    const w = this.controller.sim.world;
    const p = w.player;
    this.followTarget.x = Math.round(p.x + p.w / 2);
    this.followTarget.y = Math.round(p.y + p.h / 2);
    this.gfx.clear();
    for (const e of w.entities) {
      if (!e.alive) continue;
      const blink = e.isPlayer && e.invulnTicks > 0 && Math.floor(e.invulnTicks / 4) % 2 === 0;
      this.gfx.fillStyle(this.colorFor(e), blink ? 0.4 : 1);
      const dw = e.w * e.scaleX;
      const dh = e.h * e.scaleY;
      this.gfx.fillRect(e.x + (e.w - dw) / 2, e.y + (e.h - dh), dw, dh);
    }
    if (this.controller.scene === 'play') {
      const won = w.flags.won ? '  LEVEL COMPLETE' : w.flags.gameOver ? '  GAME OVER' : w.flags.paused ? '  PAUSED' : '';
      const extra = Object.entries(w.hud).map(([k, v]) => `  ${k.toUpperCase()} ${v}`).join('');
      // HP only matters with more than one hit point, deaths once there has been one (a puzzle board has neither).
      const hp = p.maxHp > 1 ? `HP ${p.hp}  ` : '';
      const deaths = w.deaths > 0 ? `  DEATHS ${w.deaths}` : '';
      this.hud.setText(`${hp}SCORE ${w.score}${deaths}${extra}${won}`);
    } else {
      this.hud.setText('');
    }
  }
}

export function createPhaserGame(controller: GameController, style: ViewStyle, parent: HTMLElement | string | undefined, onCreated: () => void): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: style.canvas.w,
    height: style.canvas.h,
    parent,
    pixelArt: style.pixelArt,
    roundPixels: true,
    backgroundColor: style.palette.background,
    banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [new MainScene(controller, style, onCreated)],
  };
  return new Phaser.Game(config);
}
