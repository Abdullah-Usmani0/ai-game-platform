import Phaser from 'phaser';
import { SpriteSheet } from '@gg/schemas';
import type { Entity, Menu } from '../sim/world.js';
import { sfxFor } from './art/audio.js';
import { mix, parseHex, toInt, type RGB } from './art/color.js';
import { fitRow, textImage, wrapText } from './art/font.js';
import { artPalette, type ArtPalette, type OutlineMode } from './art/palette.js';
import { PixelCanvas, hash2 } from './art/pixels.js';
import { FLAG, PARTICLES, TORCH, paintClouds, paintGlow, paintNebula, paintParticle, paintPlanet, paintRidge, paintScanlines, paintShadow, paintSky, paintSkyOrb, paintStars, paintVignette, paintVoid } from './art/scenery.js';
import { compileSheet, playerRecipe, spriteFor } from './art/designs.js';
import { RECIPES, cropRecipe, cropTune, frameSize, legendFor, paintFrames, type Anchor, type Recipe } from './art/sprites.js';
import { paintRegion, prepareLevelArt, settingFor, torchSpots, type Setting } from './art/terrain.js';
import { toCanvas } from './canvas.js';
import type { GameController } from './controller.js';
import { Sfx } from './sfx.js';

export interface ViewStyle {
  canvas: { w: number; h: number };
  pixelArt: boolean;
  palette: { background: string; mid: string; foreground: string; accent: string; danger: string; ui: string };
  camera: { lerp: number; maxShake: number; deadzone: { w: number; h: number } };
  /** From the style card; optional so bundles built before them still boot. */
  outline?: OutlineMode;
  postFx?: { vignette: boolean; bloom: boolean; crt: boolean };
  animationFps?: { character: number; effects: number };
  /** The genre picks the setting (side, dungeon, field, farm, space) and the player's look. */
  genre?: string;
  /** Shown on the title screen. */
  title?: string;
}

const ANIM_ALIASES: Record<string, string> = { walk: 'run', fly: 'run', chase: 'run', move: 'run', patrol: 'run', hop: 'jump', shoot: 'aim', charge: 'windup' };
/** Fallback colours by the palette role an entity type asks for: light, base, dark template letters. */
const TINT_LETTERS: Record<string, [string, string, string]> = { accent: ['b', 'A', 'a'], ui: ['I', 'i', 't'], danger: ['e', 'D', 'd'], foreground: ['5', '4', '3'], mid: ['u', 'T', 't'] };
const CHUNK_TILES = 64;
const HUD_H = 14;
/** How long the level name stays up after a level loads, in ticks. */
const BANNER_TICKS = 110;
/** Feedback sources that hit harder than an ordinary hit: a longer hitstop and a bigger shake. */
const HEAVY_SOURCES = new Set(['custom:finisher', 'custom:slam', 'custom:enrage']);
/** Height of the boss health band at the bottom of the screen. */
const BOSS_H = 18;

interface Sheet {
  key: string;
  w: number;
  h: number;
  anchor: Anchor;
  anims: Map<string, string[]>;
  directional: boolean;
  /** Lies on the ground under everything that stands (a soil plot). */
  floor: boolean;
  /** Casts no shadow (a door in a wall, a house front). */
  noShadow: boolean;
}

interface Shown {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image | null;
  glow: Phaser.GameObjects.Image | null;
  sheet: Sheet;
  dir: 'down' | 'up' | 'side';
}

interface Particle {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ay: number;
  life: number;
  max: number;
  /** Fades out with its life (afterimages, glows and slashes fade; dust just ends). */
  fade: boolean;
  /** The sim tick it has been moved up to: a particle born late in a long manual step ages from its own birth. */
  at: number;
}

interface Layer {
  obj: Phaser.GameObjects.TileSprite;
  fx: number;
  fy: number;
  driftX: number;
  driftY: number;
  /** Ridges and clouds sit on the horizon: they tile across but rise and sink with the camera instead of wrapping. */
  horizon: boolean;
}

/** The only Phaser code in the SDK: draws the sim state with the art kit, plays its sounds, binds feedback. */
export class MainScene extends Phaser.Scene {
  private pal!: ArtPalette;
  private setting: Setting = 'side';
  private fx = { vignette: true, bloom: true, crt: false };
  private fps = { character: 10, effects: 15 };
  private sheets = new Map<string, Sheet>();
  private shown = new Map<number, Shown>();
  private lastSeen = new Map<number, { cx: number; cy: number }>();
  private lastEvent = new Map<string, Record<string, unknown>>();
  private particles: Particle[] = [];
  private pool: Phaser.GameObjects.Image[] = [];
  private levelObjects: Phaser.GameObjects.GameObject[] = [];
  private levelTextures: string[] = [];
  private chunks: Phaser.GameObjects.Image[] = [];
  private chunkTextures: string[] = [];
  private layers: Layer[] = [];
  private motes: Array<{ img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; phase: number }> = [];
  private decor: Array<{ img: Phaser.GameObjects.Image; frames: string[]; glow: Phaser.GameObjects.Image | null; phase: number }> = [];
  private icons = new Map<string, PixelCanvas>();
  private texts = new Map<string, PixelCanvas>();
  private hudTex: Phaser.Textures.CanvasTexture | null = null;
  private hudImg!: Phaser.GameObjects.Image;
  private hudSig = '';
  private overlayTex: Phaser.Textures.CanvasTexture | null = null;
  private overlayImg!: Phaser.GameObjects.Image;
  private overlaySig = '';
  /** The open menu's id and highlight when last drawn, to click on a highlight change. */
  private menuSeen = '';
  private fadeImg!: Phaser.GameObjects.Image;
  /** A farm's light through the day (multiplied over the world), the dark of a night's sleep, the faced tile's cursor. */
  private dayImg!: Phaser.GameObjects.Image;
  private sleepImg!: Phaser.GameObjects.Image;
  private sleepFrom = -1;
  private cursorImg!: Phaser.GameObjects.Image;
  private bannerImg: Phaser.GameObjects.Image | null = null;
  private followTarget = { x: 0, y: 0 };
  private unsubs: Array<() => void> = [];
  private drawnVersion = -1;
  private drawnExitLocked = false;
  private horizonY = 0;
  private hitstopUntil = 0;
  private dashUntilTick = -1;
  private swingTick = -100;
  private lastGhostTick = -1;
  /** Entity types the game marks as bosses (their bar, their death). */
  private bossTypes = new Set<string>();
  /** Types drawn as a shipped type (a renamed type keeps its archetype's art, shadow and rotation). */
  private drawAs = new Map<string, string>();
  /** The game's own designs for its types and its player ('@player'), from content/sprites.json. */
  private designs = new Map<string, Recipe>();
  private bossTex: Phaser.Textures.CanvasTexture | null = null;
  private bossImg!: Phaser.GameObjects.Image;
  private bossSig = '';
  /** The boss's health a moment ago: the bar shows what a hit took as a pale stretch that drains away. */
  private bossTrail = { id: -1, hp: 0, seen: 0, hold: 0 };
  /** Attack telegraphs on the floor (a boss's slam reach), following their entity while it winds up. */
  private telegraphs: Array<{ img: Phaser.GameObjects.Image; entity: number; from: number }> = [];
  private lastBossTick = 0;
  /** Decorations (flags, torches) keep moving on the title screen, when the sim is not ticking. */
  private animTick = 0;
  readonly sfx = new Sfx();

  constructor(
    private readonly controller: GameController,
    private readonly style: ViewStyle,
    private readonly onCreated: () => void,
  ) {
    super('main');
  }

  create(): void {
    this.pal = artPalette(this.style.palette, this.style.outline ?? 'dark');
    this.fx = { ...this.fx, ...(this.style.postFx ?? {}) };
    this.fps = { ...this.fps, ...(this.style.animationFps ?? {}) };
    this.setting = settingFor(this.style.genre, this.controller.sim.options.movementMode);
    this.readDesigns();
    const { w, h } = this.style.canvas;
    const cam = this.cameras.main;
    cam.setBackgroundColor(this.setting === 'side' ? this.style.palette.background : toInt(this.pal.ink));
    cam.setRoundPixels(true);
    this.buildSheets();
    this.buildEffectTextures();
    this.addScreenEffects();
    // Bloom: the brightest pixels (sparks, coins, torches, the moon) bleed a little light. WebGL only (no filters on canvas).
    if (this.fx.bloom && this.game.renderer.type === Phaser.WEBGL) {
      const bloom = cam.filters.internal.addParallelFilters();
      bloom.top.addThreshold(0.6, 0.95);
      bloom.top.addBlur(1, 1.2, 1.2, 1);
      bloom.blend.blendMode = Phaser.BlendModes.ADD;
      bloom.blend.amount = 0.4;
    }
    this.hudTex = this.textures.createCanvas('gg-hud', w, HUD_H);
    this.hudImg = this.add.image(0, 0, 'gg-hud').setOrigin(0).setScrollFactor(0).setDepth(10_000).setVisible(false);
    this.bossTypes = new Set(this.controller.options.simOptions.entityDefs.filter((d) => d.boss).map((d) => d.type));
    this.drawAs = new Map(this.controller.options.simOptions.entityDefs.flatMap((d) => (d.drawAs ? [[d.type, d.drawAs] as const] : [])));
    this.bossTex = this.textures.createCanvas('gg-boss', w, BOSS_H);
    this.bossImg = this.add.image(0, h - BOSS_H, 'gg-boss').setOrigin(0).setScrollFactor(0).setDepth(10_000).setVisible(false);
    this.overlayTex = this.textures.createCanvas('gg-overlay', w, h);
    this.overlayImg = this.add.image(0, 0, 'gg-overlay').setOrigin(0).setScrollFactor(0).setDepth(11_000).setVisible(false);
    this.fadeImg = this.add.image(0, 0, 'gg-px').setOrigin(0).setScrollFactor(0).setDisplaySize(w, h).setTint(toInt(this.pal.ink)).setDepth(12_000).setAlpha(0);
    this.dayImg = this.add.image(0, 0, 'gg-px').setOrigin(0).setScrollFactor(0).setDisplaySize(w, h).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(9_000).setVisible(false);
    this.sleepImg = this.add.image(0, 0, 'gg-px').setOrigin(0).setScrollFactor(0).setDisplaySize(w, h).setTint(toInt(mix(this.pal.ink, this.pal.garment[0], 0.3))).setDepth(11_500).setAlpha(0);
    this.cursorImg = this.add.image(0, 0, 'gg-cursor').setVisible(false);
    this.unsubs.push(this.controller.onLevelChange(() => this.bindLevel()));
    this.unsubs.push(this.controller.onSceneChange(() => (this.overlaySig = '')));
    this.bindLevel();
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      this.sfx.unlock();
      if (e.code !== 'Enter' && e.code !== 'Space') return;
      const scene = this.controller.scene;
      if (scene === 'title') {
        this.sfx.play('select');
        this.controller.setScene('play');
      } else if (scene === 'results') {
        this.sfx.play('select');
        this.controller.reset();
      } else if (scene === 'play' && this.controller.sim.world.flags.gameOver && this.controller.mode === 'realtime') {
        this.sfx.play('select');
        this.controller.loadLevel(this.controller.levelIndex);
      }
    });
    this.input.on('pointerdown', () => this.sfx.unlock());
    this.onCreated();
  }

  // ---------------------------------------------------------------- textures

  private addCanvasTexture(key: string, pc: PixelCanvas): Phaser.Textures.CanvasTexture | null {
    if (this.textures.exists(key)) this.textures.remove(key);
    return this.textures.addCanvas(key, toCanvas(pc));
  }

  /** Repaints a persistent canvas texture in place (the HUD and the overlay change often; their textures never move). */
  private repaint(tex: Phaser.Textures.CanvasTexture | null, pc: PixelCanvas): void {
    if (!tex) return;
    tex.context.putImageData(new ImageData(new Uint8ClampedArray(pc.data), pc.w, pc.h), 0, 0);
    tex.refresh();
  }

  private sheetFromRecipe(name: string, recipe: Recipe): Sheet {
    const frames = paintFrames(recipe, this.pal);
    const { w, h } = frameSize(recipe);
    const pc = new PixelCanvas(w * frames.length, h);
    frames.forEach((f, i) => pc.blit(f.pc, i * w, 0));
    const key = `gg-sheet-${name}`;
    const tex = this.addCanvasTexture(key, pc);
    const anims = new Map<string, string[]>();
    frames.forEach((f, i) => {
      const frame = `${f.anim}:${f.frame}`;
      tex?.add(frame, 0, i * w, 0, w, h);
      anims.set(f.anim, [...(anims.get(f.anim) ?? []), frame]);
    });
    const sheet: Sheet = { key, w, h, anchor: recipe.anchor, anims, directional: anims.has('down-idle'), floor: recipe.floor === true, noShadow: recipe.noShadow === true || recipe.floor === true };
    this.sheets.set(name, sheet);
    return sheet;
  }

  /**
   * The game's designs (content/sprites.json), each compiled on its own: one that cannot be read or drawn is left out
   * and its type draws as it ships. Never a crash, never the placeholder shape.
   */
  private readDesigns(): void {
    const raw = this.controller.options.simOptions.content?.['sprites'];
    if (raw === undefined) return;
    const stats = this.controller.drawStats;
    const parsed = SpriteSheet.safeParse(raw);
    if (!parsed.success) {
      stats.designFallbacks.push('content/sprites.json');
      return;
    }
    const { recipes, failed } = compileSheet(parsed.data);
    stats.designFallbacks.push(...failed);
    for (const [type, recipe] of recipes) {
      try {
        paintFrames(recipe, this.pal);
        this.designs.set(type, recipe);
      } catch {
        stats.designFallbacks.push(type);
      }
    }
    stats.designs = this.designs.size;
  }

  private buildSheets(): void {
    for (const [name, recipe] of Object.entries(RECIPES)) this.sheetFromRecipe(name, recipe);
    for (const [type, recipe] of this.designs) this.sheetFromRecipe(`game:${type}`, recipe);
    this.sheetFromRecipe('flag', FLAG);
    this.sheetFromRecipe('torch', TORCH);
  }

  /** A round creature, a gem or a block, sized to an entity type no recipe knows (bespoke systems add their own types). */
  private fallbackSheet(e: Entity): Sheet {
    const name = `fallback-${e.type}`;
    const known = this.sheets.get(name);
    if (known) return known;
    this.controller.drawStats.blobFallbacks.push(e.type);
    const w = Math.max(3, Math.round(e.w));
    const h = Math.max(3, Math.round(e.h));
    const hostile = e.contactDamage > 0 || e.fsm !== null;
    const role = e.tint ?? (e.pickup ? 'accent' : hostile ? 'danger' : 'mid');
    const [lit, base, dark] = TINT_LETTERS[role] ?? TINT_LETTERS['mid']!;
    const gem = e.pickup || role === 'accent';
    const rows: string[] = [];
    for (let y = 0; y < h; y++) {
      let row = '';
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - w / 2) / (w / 2);
        const dy = (y + 0.5 - h / 2) / (h / 2);
        const inside = gem ? Math.abs(dx) + Math.abs(dy) <= 1.05 : hostile ? dx * dx + dy * dy <= 1.08 : true;
        const eye = hostile && w >= 6 && y === Math.floor(h * 0.4) && (x === Math.floor(w * 0.3) || x === Math.floor(w * 0.65));
        row += !inside ? '.' : eye ? 'k' : dx + dy < -0.5 ? lit : dx + dy > 0.6 ? dark : base;
      }
      rows.push(row);
    }
    return this.sheetFromRecipe(name, { anchor: e.gravity ? 'feet' : 'center', anims: { idle: [rows] } });
  }

  private buildEffectTextures(): void {
    const px = new PixelCanvas(4, 4);
    px.fillRect(0, 0, 4, 4, [255, 255, 255]);
    this.addCanvasTexture('gg-px', px);
    this.addCanvasTexture('gg-glow', paintGlow(16, [255, 255, 255]));
    this.addCanvasTexture('gg-shadow', paintShadow(10, 4, this.pal.ink));
    for (const [name, shape] of Object.entries(PARTICLES)) this.addCanvasTexture(`gg-p-${name}`, paintParticle(shape, [255, 255, 255]));
    // A crescent for melee swings, pointing right; it is rotated toward the swing.
    const slash = new PixelCanvas(16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const r = Math.hypot(x - 4, y - 7.5);
        const a = Math.atan2(y - 7.5, x - 4);
        if (r > 6.5 && r < 9.5 && Math.abs(a) < 1.15) slash.set(x, y, [255, 255, 255], r > 8.3 ? 255 : 150);
      }
    }
    this.addCanvasTexture('gg-slash', slash);
    // A dithered ring the size of a boss slam's reach (24 px), drawn on the floor while it winds up.
    const tele = new PixelCanvas(51, 51);
    for (let y = 0; y < 51; y++) {
      for (let x = 0; x < 51; x++) {
        const r = Math.hypot(x - 25, y - 25);
        if (r <= 24.5 && r > 22.5) tele.set(x, y, [255, 255, 255]);
        else if (r <= 22.5 && (x + y) % 3 === 0) tele.set(x, y, [255, 255, 255], 110);
      }
    }
    this.addCanvasTexture('gg-telegraph', tele);
    // The faced tile's cursor: four corner ticks around a tile.
    const ts = this.controller.sim.map.tileSize;
    const cur = new PixelCanvas(ts + 2, ts + 2);
    for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [ts + 1, 0, -1, 1], [0, ts + 1, 1, -1], [ts + 1, ts + 1, -1, -1]] as const) {
      for (let i = 0; i < 3; i++) {
        cur.set(cx + dx * i, cy, [255, 255, 255]);
        cur.set(cx, cy + dy * i, [255, 255, 255]);
      }
    }
    this.addCanvasTexture('gg-cursor', cur);
    const legend = legendFor(this.pal);
    for (const [key, tpl] of Object.entries(HUD_ICONS)) {
      const pc = new PixelCanvas(tpl[0]!.length + 2, tpl.length + 2);
      pc.stamp(tpl, legend, 1, 1);
      pc.outline('dark', this.pal.ink);
      this.icons.set(key, pc);
    }
  }

  private addScreenEffects(): void {
    const { w, h } = this.style.canvas;
    if (this.fx.vignette) {
      this.addCanvasTexture('gg-vignette', paintVignette(w, h, this.pal.ink, this.setting === 'side' ? 0.45 : 0.62));
      this.add.image(0, 0, 'gg-vignette').setOrigin(0).setScrollFactor(0).setDepth(9_000);
    }
    if (this.fx.crt) {
      this.addCanvasTexture('gg-scan', paintScanlines(w, h, this.pal.ink));
      this.add.image(0, 0, 'gg-scan').setOrigin(0).setScrollFactor(0).setDepth(9_500);
    }
  }

  /** A line of pixel text, outlined in ink (cached: HUD values repeat). */
  private text(text: string, color: RGB, scale = 1, lower?: RGB): PixelCanvas {
    const key = `${text}|${color.join(',')}|${scale}|${lower?.join(',') ?? ''}`;
    let pc = this.texts.get(key);
    if (!pc) {
      if (this.texts.size > 400) this.texts.clear();
      pc = textImage(text, { color, ink: this.pal.ink, scale, lower });
      this.texts.set(key, pc);
    }
    return pc;
  }

  // ---------------------------------------------------------------- the level

  private clearLevel(): void {
    for (const o of [...this.levelObjects, ...this.chunks]) o.destroy();
    for (const k of [...this.levelTextures, ...this.chunkTextures]) if (this.textures.exists(k)) this.textures.remove(k);
    this.levelObjects = [];
    this.levelTextures = [];
    this.chunks = [];
    this.chunkTextures = [];
    this.layers = [];
    this.motes = [];
    this.decor = [];
    for (const s of this.shown.values()) this.dropShown(s);
    this.shown.clear();
    this.lastSeen.clear();
    for (const p of this.particles) this.release(p.img);
    this.particles = [];
    for (const t of this.telegraphs) t.img.destroy();
    this.telegraphs = [];
    this.bossTrail = { id: -1, hp: 0, seen: 0, hold: 0 };
    this.bossSig = '';
    this.bannerImg?.destroy();
    this.bannerImg = null;
  }

  private bindLevel(): void {
    for (const u of this.unsubs.splice(2)) u();
    this.clearLevel();
    const sim = this.controller.sim;
    const map = sim.map;
    const cam = this.cameras.main;
    // A level smaller than the view sits in its middle (below the HUD, when it fits there): grow the bounds evenly around
    // it instead of pinning it top-left.
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const bw = Math.max(map.pixelWidth, viewW);
    const bh = Math.max(map.pixelHeight, viewH);
    const spare = bh - map.pixelHeight;
    const by = -(spare >= HUD_H ? spare + HUD_H : spare) / 2;
    cam.setBounds(-(bw - map.pixelWidth) / 2, by, bw, bh);
    this.horizonY = by + bh - viewH;
    cam.startFollow(this.followTarget, true, this.style.camera.lerp, this.style.camera.lerp);
    cam.setDeadzone(this.style.camera.deadzone.w, this.style.camera.deadzone.h);
    const p = sim.world.player;
    this.followTarget.x = Math.round(p.x + p.w / 2);
    this.followTarget.y = Math.round(p.y + p.h / 2);
    cam.centerOn(this.followTarget.x, this.followTarget.y);
    this.buildBackdrop();
    this.buildTiles();
    this.buildDecor();
    this.buildMotes();
    this.showBanner();
    const maxShake = this.style.camera.maxShake;
    // The sim decides *that* feedback happens (feedback-binder); the view decides *how* each channel looks and sounds.
    this.unsubs.push(
      sim.events.on('*', (ev) => {
        this.lastEvent.set(ev.name, ev.payload);
        if (ev.name === 'feedback') {
          const channel = String(ev.payload['channel']);
          // Shake and flash run on real time: a manually stepped game (bots, screenshots, thumbnails) skips them, so a
          // frame captured at a tick looks the same on every run instead of catching a flash from the steps before it.
          const realtime = this.controller.mode === 'realtime';
          const heavy = HEAVY_SOURCES.has(String(ev.payload['source']));
          if (channel === 'shake' && maxShake > 0 && realtime) cam.shake(heavy ? 220 : 140, (heavy ? 0.008 : 0.0045) * maxShake);
          else if (channel === 'flash' && realtime) cam.flash(heavy ? 120 : 80, ...this.pal.white);
          else if (channel === 'hitstop') this.hitstopUntil = performance.now() + (heavy ? 95 : 60);
          else if (channel === 'particle') this.celebrate(String(ev.payload['source']));
        } else if (ev.name === 'audio_play') {
          const source = String(ev.payload['sfx'] ?? ev.payload['source']);
          const name = sfxFor(source, this.lastEvent.get(source) ?? {}, (id) => id === this.controller.sim.world.player.id);
          if (name) this.sfx.play(name);
        } else {
          this.animateEvent(ev.name, ev.payload);
        }
      }),
    );
  }

  private buildBackdrop(): void {
    const { w, h } = this.style.canvas;
    const add = (key: string, pc: PixelCanvas, depth: number, layer: Omit<Layer, 'obj'>) => {
      this.addCanvasTexture(key, pc);
      this.levelTextures.push(key);
      const obj = this.add.tileSprite(0, 0, w, pc.h, key).setOrigin(0).setScrollFactor(0).setDepth(depth);
      this.levelObjects.push(obj);
      this.layers.push({ obj, ...layer });
    };
    const image = (key: string, pc: PixelCanvas, x: number, y: number, depth: number) => {
      this.addCanvasTexture(key, pc);
      this.levelTextures.push(key);
      this.levelObjects.push(this.add.image(Math.round(x), Math.round(y), key).setScrollFactor(0).setDepth(depth));
    };
    const still = { fx: 0, fy: 0, driftX: 0, driftY: 0, horizon: false };
    if (this.setting === 'side') {
      add('gg-sky', paintSky(this.pal, w, h), -100, still);
      image('gg-orb', paintSkyOrb(this.pal, 9), w * 0.76, h * 0.2, -98);
      add('gg-far', paintRidge(256, h, this.pal.far, { seed: 1, base: 0.74, height: 0.3, jag: 0.8 }), -95, { fx: 0.1, fy: 0.05, driftX: 0, driftY: 0, horizon: true });
      add('gg-clouds', paintClouds(this.pal, 320, h, 3), -93, { fx: 0.16, fy: 0.03, driftX: 0.05, driftY: 0, horizon: true });
      add('gg-near', paintRidge(320, h, this.pal.near, { seed: 2, base: 0.92, height: 0.26, jag: 0.35 }), -90, { fx: 0.3, fy: 0.12, driftX: 0, driftY: 0, horizon: true });
    } else if (this.setting === 'space') {
      add('gg-sky', paintSky(this.pal, w, h, 3), -100, still);
      add('gg-nebula', paintNebula(this.pal, 256, 7), -98, { fx: 0.05, fy: 0.05, driftX: 0, driftY: -0.05, horizon: false });
      add('gg-stars1', paintStars(this.pal, 160, 160, 51, 0.0035, false), -96, { fx: 0.1, fy: 0.1, driftX: 0, driftY: -0.12, horizon: false });
      image('gg-planet', paintPlanet(this.pal, 22), w * 0.82, h * 0.3, -95);
      add('gg-stars2', paintStars(this.pal, 200, 200, 53, 0.002, true), -94, { fx: 0.25, fy: 0.25, driftX: 0, driftY: -0.35, horizon: false });
      add('gg-stars3', paintStars(this.pal, 240, 240, 57, 0.0009, true), -92, { fx: 0.5, fy: 0.5, driftX: 0, driftY: -0.8, horizon: false });
    } else {
      // Rock around a level smaller than the view (puzzle boards); it moves with the world.
      const map = this.controller.sim.map;
      this.addCanvasTexture('gg-void', paintVoid(this.pal));
      this.levelTextures.push('gg-void');
      const pad = Math.max(w, h);
      this.levelObjects.push(this.add.tileSprite(-pad, -pad, map.pixelWidth + pad * 2, map.pixelHeight + pad * 2, 'gg-void').setOrigin(0).setDepth(-100));
    }
  }

  /** The level's tiles as chunks of canvas texture; rebuilt when tiles change (doors) or a dungeon exit unlocks. */
  private buildTiles(): void {
    for (const c of this.chunks) c.destroy();
    for (const k of this.chunkTextures) if (this.textures.exists(k)) this.textures.remove(k);
    this.chunks = [];
    this.chunkTextures = [];
    const map = this.controller.sim.map;
    const ts = map.tileSize;
    const exitLocked = this.exitLocked();
    const art = prepareLevelArt(this.pal, this.setting, map, exitLocked);
    if (this.setting !== 'space') {
      for (let cy = 0; cy < map.height; cy += CHUNK_TILES) {
        for (let cx = 0; cx < map.width; cx += CHUNK_TILES) {
          const pc = new PixelCanvas(Math.min(CHUNK_TILES, map.width - cx) * ts, Math.min(CHUNK_TILES, map.height - cy) * ts);
          paintRegion(art, pc, cx * ts, cy * ts);
          const key = `gg-chunk-${cx}-${cy}`;
          this.addCanvasTexture(key, pc);
          this.chunkTextures.push(key);
          this.chunks.push(this.add.image(cx * ts, cy * ts, key).setOrigin(0).setDepth(0));
        }
      }
    }
    this.drawnVersion = map.version;
    this.drawnExitLocked = exitLocked;
  }

  private exitLocked(): boolean {
    return String(this.controller.sim.world.hud['exit'] ?? '').toLowerCase() === 'locked';
  }

  private buildDecor(): void {
    const map = this.controller.sim.map;
    const ts = map.tileSize;
    if (this.setting === 'side') {
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          if (map.kindAt(tx, ty) === 'goal' && (ty + 1 >= map.height || map.kindAt(tx, ty + 1) !== 'goal')) this.addDecor('flag', tx * ts + Math.floor(ts / 2), (ty + 1) * ts, 'feet', this.pal.accent[3], tx);
        }
      }
    }
    // Torches hang where the floor's light was baked from.
    if (this.setting === 'dungeon') for (const s of torchSpots(map)) this.addDecor('torch', s.tx * ts + ts / 2, s.ty * ts + ts * 0.62, 'center', this.pal.accent[3], s.tx + s.ty);
  }

  /** Ambient motes drifting across the view: fireflies under a night sky, embers in a dungeon, pollen over a field. */
  private buildMotes(): void {
    if (this.setting === 'space') return;
    const { w, h } = this.style.canvas;
    const night = this.pal.sky[0][0] + this.pal.sky[0][1] + this.pal.sky[0][2] < 150;
    const kind = this.setting === 'dungeon' ? 'ember' : this.setting === 'field' ? 'pollen' : night ? 'firefly' : 'pollen';
    const color = kind === 'ember' ? this.pal.accent[4] : kind === 'firefly' ? mix(this.pal.rim[4], this.pal.accent[4], 0.5) : this.pal.white;
    for (let i = 0; i < 14; i++) {
      const img = this.add.image(0, 0, 'gg-p-dot').setScrollFactor(0).setDepth(kind === 'ember' ? 350 : 95).setTint(toInt(color)).setBlendMode(Phaser.BlendModes.ADD);
      this.levelObjects.push(img);
      this.motes.push({
        img,
        x: hash2(i, 1, 151) * w,
        y: hash2(i, 2, 151) * h,
        vx: kind === 'ember' ? (hash2(i, 3, 151) - 0.5) * 0.1 : (hash2(i, 3, 151) - 0.35) * 0.18,
        vy: kind === 'ember' ? -0.12 - hash2(i, 4, 151) * 0.15 : (hash2(i, 4, 151) - 0.5) * 0.08,
        phase: hash2(i, 5, 151) * Math.PI * 2,
      });
    }
  }

  private addDecor(name: string, x: number, y: number, anchor: Anchor, glowColor: RGB, phase: number): void {
    const sheet = this.sheets.get(name)!;
    const frames = [...sheet.anims.values()][0]!;
    const img = this.add.image(Math.round(x), Math.round(y), sheet.key, frames[0]).setOrigin(0.5, anchor === 'feet' ? 1 : 0.5).setDepth(5);
    const glowY = Math.round(y - (anchor === 'feet' ? sheet.h * 0.75 : 1));
    const glow = this.fx.bloom
      ? this.add
          .image(Math.round(x), glowY, 'gg-glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(toInt(glowColor))
          .setScale(name === 'torch' ? 1.5 : 2)
          .setDepth(4)
      : null;
    this.levelObjects.push(img);
    if (glow) this.levelObjects.push(glow);
    this.decor.push({ img, frames, glow, phase });
  }

  // ---------------------------------------------------------------- entities

  /** The sheet an entity draws with: the game's design for its type (or the player's), else its shipped sprite. */
  private recipeName(e: Entity): string | null {
    if (e.isPlayer) return this.designs.has('@player') ? 'game:@player' : playerRecipe(this.setting, e.w);
    return spriteFor(e.type, { drawAs: this.drawAs.get(e.type), designs: this.designs })?.name ?? (e.isProjectile ? 'orb' : null);
  }

  private sheetFor(e: Entity): Sheet {
    // A crop draws by its shape, its produce in its own colour.
    const shape = e.props['shape'];
    const color = e.props['color'];
    if (typeof shape === 'string' && typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
      const name = `crop-${shape}-${color.toLowerCase()}`;
      const tune = cropTune(parseHex(color));
      return this.sheets.get(name) ?? this.sheetFromRecipe(name, { ...cropRecipe(shape), tune: () => tune });
    }
    const name = this.recipeName(e);
    return (name && this.sheets.get(name)) || this.fallbackSheet(e);
  }

  private animFor(e: Entity, s: Shown, tick: number): string {
    const has = (a: string) => s.sheet.anims.has(a);
    const hurt = e.tookDamageTick >= 0 && tick - e.tookDamageTick < 14;
    if (s.sheet.directional) {
      if (Math.abs(e.vy) > Math.abs(e.vx) + 0.05) s.dir = e.vy < 0 ? 'up' : 'down';
      else if (Math.abs(e.vx) > 0.05) s.dir = 'side';
      const moving = Math.abs(e.vx) + Math.abs(e.vy) > 0.05 || e.anim === 'run';
      const attacking = e.anim === 'attack' || (e.isPlayer && tick - this.swingTick < 8);
      const base = hurt ? 'hurt' : attacking ? 'attack' : moving ? 'run' : 'idle';
      return has(`${s.dir}-${base}`) ? `${s.dir}-${base}` : `${s.dir}-idle`;
    }
    if (hurt && has('hurt')) return 'hurt';
    if (e.isPlayer && this.setting === 'side') {
      if (tick <= this.dashUntilTick && has('dash')) return 'dash';
      if (!e.grounded) return e.vy < 0 ? 'jump' : 'fall';
      return Math.abs(e.vx) > 0.15 ? 'run' : 'idle';
    }
    if (has('lit') && (e.flags['onTarget'] || e.flags['lit'] || e.anim === 'lit')) return 'lit';
    const asked = ANIM_ALIASES[e.anim] ?? e.anim;
    if (asked && has(asked)) return asked;
    if (e.gravity && !e.grounded && has('jump')) return 'jump';
    if ((Math.abs(e.vx) > 0.05 || Math.abs(e.vy) > 0.05) && has('run')) return 'run';
    return has('idle') ? 'idle' : has('run') ? 'run' : s.sheet.anims.keys().next().value!;
  }

  private dropShown(s: Shown): void {
    s.img.destroy();
    s.shadow?.destroy();
    s.glow?.destroy();
  }

  private syncEntities(): void {
    const sim = this.controller.sim;
    const tick = sim.tick;
    const seen = new Set<number>();
    const ysort = this.setting !== 'side';
    const shadows = this.setting === 'dungeon' || this.setting === 'field' || this.setting === 'farm';
    for (const e of sim.world.entities) {
      if (!e.alive) continue;
      seen.add(e.id);
      let s = this.shown.get(e.id);
      if (!s) {
        const sheet = this.sheetFor(e);
        const img = this.add.image(0, 0, sheet.key, sheet.anims.values().next().value![0]);
        img.setOrigin(0.5, sheet.anchor === 'feet' ? 1 : 0.5);
        const grounded = !e.isProjectile && (sheet.anchor === 'feet' || e.pickup || e.fsm !== null);
        const shadow = shadows && grounded && !sheet.noShadow && (this.drawAs.get(e.type) ?? e.type) !== 'target' ? this.add.image(0, 0, 'gg-shadow') : null;
        const glow = this.fx.bloom && (e.pickup || e.isProjectile) ? this.add.image(0, 0, 'gg-glow').setBlendMode(Phaser.BlendModes.ADD) : null;
        s = { img, shadow, glow, sheet, dir: 'down' };
        this.shown.set(e.id, s);
      }
      const anim = this.animFor(e, s, tick);
      const frames = s.sheet.anims.get(anim) ?? [...s.sheet.anims.values()][0]!;
      const fps = e.pickup || e.isProjectile ? this.fps.effects : this.fps.character;
      s.img.setFrame(frames[Math.floor((tick * fps) / 60) % frames.length]!);
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      const feet = e.y + e.h;
      // Pickups bob gently; everything else sits where the sim puts it.
      const bob = e.pickup ? Math.round(Math.sin((tick + e.id * 13) / 9) * 1.2) : 0;
      if (s.sheet.anchor === 'feet') s.img.setPosition(Math.round(cx), Math.round(feet) + 1);
      else s.img.setPosition(Math.round(cx), Math.round(cy) + bob);
      s.img.setScale(e.scaleX, e.scaleY);
      const flips = this.setting === 'side' ? true : s.sheet.directional ? s.dir === 'side' : this.setting !== 'space' && !e.pickup;
      s.img.setFlipX(flips && e.facing < 0);
      if ((this.drawAs.get(e.type) ?? e.type) === 'arrow') s.img.setRotation(Math.atan2(e.vy, e.vx));
      // Invulnerable after a hit: blink. Not while dashing (the dash's own frames are its afterimages).
      const blink = e.isPlayer && e.invulnTicks > 0 && !e.flags['dashing'] && Math.floor(e.invulnTicks / 4) % 2 === 0;
      s.img.setAlpha(blink ? 0.35 : 1);
      // A wind-up or an aim flashes the attacker hot red: every attack is read before it lands.
      const telegraph = !e.isPlayer && (e.anim === 'windup' || e.anim === 'aim') && tick % 8 < 3;
      if (e.tookDamageTick >= 0 && tick - e.tookDamageTick < 4) s.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else if (telegraph) s.img.setTint(toInt(this.pal.danger[3])).setTintMode(Phaser.TintModes.FILL);
      else s.img.clearTint();
      const depth = s.sheet.floor ? 60 : ysort ? 100 + feet : e.isPlayer ? 120 : e.pickup ? 90 : e.isProjectile ? 115 : 110;
      s.img.setDepth(depth);
      if (s.shadow) s.shadow.setPosition(Math.round(cx), Math.round(feet)).setScale(Math.max(0.5, e.w / 9), 1).setDepth(50);
      if (s.glow) {
        const c = e.pickup ? this.pal.accent[3] : e.contactDamage > 0 ? this.pal.danger[3] : this.pal.accent[4];
        s.glow
          .setPosition(Math.round(cx), Math.round(cy) + bob)
          .setTint(toInt(c))
          .setAlpha(0.34 + 0.1 * Math.sin(tick / 7 + e.id))
          .setScale(Math.max(0.35, (e.w + 4) / 16))
          .setDepth(depth - 1);
      }
      this.lastSeen.set(e.id, { cx, cy });
    }
    for (const [id, s] of this.shown) {
      if (seen.has(id)) continue;
      this.dropShown(s);
      this.shown.delete(id);
    }
    if (this.lastSeen.size > 1024) for (const id of [...this.lastSeen.keys()]) if (!seen.has(id)) this.lastSeen.delete(id);
    // Dash afterimages: a fading copy of the player every other tick while the dash lasts.
    const p = sim.world.player;
    const ps = this.shown.get(p.id);
    if (ps && tick <= this.dashUntilTick && tick % 2 === 0 && tick !== this.lastGhostTick) {
      this.lastGhostTick = tick;
      const ghost = this.take(ps.sheet.key, ps.img.frame.name);
      ghost.setOrigin(ps.img.originX, ps.img.originY).setFlipX(ps.img.flipX).setTint(toInt(this.pal.garment[3])).setDepth(ps.img.depth - 1);
      this.particles.push({ img: ghost, x: ps.img.x, y: ps.img.y, vx: 0, vy: 0, ay: 0, life: 12, max: 12, fade: true, at: tick });
    }
  }

  // ---------------------------------------------------------------- particles and event effects

  private take(key: string, frame?: string | number): Phaser.GameObjects.Image {
    const img = this.pool.pop() ?? this.add.image(0, 0, key);
    img.setTexture(key, frame).setVisible(true).setActive(true).setOrigin(0.5).setScale(1).setRotation(0).setFlipX(false).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL).clearTint();
    return img;
  }

  private release(img: Phaser.GameObjects.Image): void {
    img.setVisible(false).setActive(false);
    this.pool.push(img);
  }

  private burst(shape: keyof typeof PARTICLES, x: number, y: number, colors: readonly RGB[], n: number, opts: { speed: number; angle?: number; spread?: number; ay?: number; life?: number; add?: boolean }): void {
    const tick = this.controller.sim.tick;
    for (let i = 0; i < n; i++) {
      const r1 = hash2(tick, i, 89 + n);
      const r2 = hash2(i, tick, 97 + n);
      const ang = (opts.angle ?? -Math.PI / 2) + (r1 - 0.5) * (opts.spread ?? Math.PI * 2);
      const sp = opts.speed * (0.45 + r2 * 0.55);
      const img = this.take(`gg-p-${shape}`).setTint(toInt(colors[i % colors.length]!)).setDepth(300);
      if (opts.add) img.setBlendMode(Phaser.BlendModes.ADD);
      const life = Math.max(2, Math.round((opts.life ?? 24) * (0.7 + r2 * 0.6)));
      this.particles.push({ img, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, ay: opts.ay ?? 0, life, max: life, fade: shape === 'ring' || opts.add === true, at: tick });
    }
  }

  /**
   * Particles move in sim ticks, so they freeze with hitstop and a manually stepped game shows the same frame each run.
   * Each ages from its own birth tick: a manual step of many ticks shows the effects of its last ticks, not none.
   */
  private stepParticles(tick: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      const ticks = Math.min(60, Math.max(0, tick - p.at));
      p.at = tick;
      for (let t = 0; t < ticks; t++) {
        p.vy += p.ay;
        p.x += p.vx;
        p.y += p.vy;
      }
      p.life -= ticks;
      if (p.life <= 0) {
        this.release(p.img);
        this.particles.splice(i, 1);
        continue;
      }
      const k = p.life / p.max;
      p.img.setPosition(Math.round(p.x), Math.round(p.y));
      if (p.fade) p.img.setAlpha(Math.min(1, k * 1.3) * 0.85);
      if (p.img.texture.key === 'gg-p-ring') p.img.setScale(1 + (1 - k) * 2.2);
    }
  }

  private where(payload: Record<string, unknown>): { x: number; y: number } {
    const ts = this.controller.sim.map.tileSize;
    const id = payload['entity'] ?? payload['target'] ?? payload['crate'];
    const seen = typeof id === 'number' ? this.lastSeen.get(id) : undefined;
    if (seen) return { x: seen.cx, y: seen.cy };
    const x = Number(payload['x']);
    const y = Number(payload['y']);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      // Grid games report tiles; everything else reports pixels.
      return this.style.genre === 'puzzle' ? { x: x * ts + ts / 2, y: y * ts + ts / 2 } : { x: x + 4, y: y + 4 };
    }
    const p = this.controller.sim.world.player;
    return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
  }

  /** Effects that are part of how things move, shown whatever the feedback table says. */
  private animateEvent(name: string, payload: Record<string, unknown>): void {
    const sim = this.controller.sim;
    const p = sim.world.player;
    const feet = { x: p.x + p.w / 2, y: p.y + p.h };
    const dust = [this.pal.rim[3], this.pal.terrain[3], this.pal.white];
    switch (name) {
      case 'jump':
        this.burst('dot', feet.x, feet.y, dust, 5, { speed: 0.7, angle: Math.PI / 2, spread: 2.6, ay: 0.02, life: 14 });
        break;
      case 'land':
        this.burst('dot', feet.x - 3, feet.y, dust, 3, { speed: 0.6, angle: Math.PI, spread: 0.7, life: 12 });
        this.burst('dot', feet.x + 3, feet.y, dust, 3, { speed: 0.6, angle: 0, spread: 0.7, life: 12 });
        break;
      case 'dash':
        this.dashUntilTick = sim.tick + 10;
        this.burst('chunk', feet.x, feet.y - 3, [this.pal.garment[3], this.pal.white], 6, { speed: 0.9, angle: p.facing < 0 ? 0 : Math.PI, spread: 1, life: 14 });
        break;
      case 'hit': {
        const at = this.where(payload);
        this.burst('spark', at.x, at.y, [this.pal.white, this.pal.danger[4], this.pal.accent[4]], 6, { speed: 1.6, life: 10, add: true });
        break;
      }
      case 'death': {
        const at = this.where(payload);
        const player = payload['entity'] === p.id;
        if (this.bossTypes.has(String(payload['type']))) {
          // A boss goes out big: rings, a fountain of embers and chunks, and the screen shakes and flashes (realtime).
          for (const life of [12, 20, 28]) this.burst('ring', at.x, at.y, [life === 20 ? this.pal.accent[4] : this.pal.white], 1, { speed: 0, life, add: true });
          this.burst('chunk', at.x, at.y, [this.pal.danger[3], this.pal.danger[1], this.pal.terrain[3], this.pal.white], 30, { speed: 2.2, ay: 0.06, life: 44 });
          this.burst('spark', at.x, at.y, [this.pal.accent[4], this.pal.danger[4], this.pal.white], 24, { speed: 2.6, life: 30, add: true });
          if (this.controller.mode === 'realtime') {
            this.cameras.main.shake(400, 0.01 * this.style.camera.maxShake);
            this.cameras.main.flash(160, ...this.pal.white);
          }
          break;
        }
        const colors = player ? [this.pal.hero[4], this.pal.garment[3], this.pal.accent[3]] : [this.pal.danger[3], this.pal.danger[1], this.pal.white];
        this.burst('chunk', at.x, at.y, colors, player ? 16 : 9, { speed: player ? 1.8 : 1.3, ay: 0.06, life: player ? 34 : 22 });
        this.burst('ring', at.x, at.y, [this.pal.white], 1, { speed: 0, life: 10, add: true });
        break;
      }
      case 'pickup': {
        const at = this.where(payload);
        this.burst('star', at.x, at.y, [this.pal.accent[4], this.pal.white], 3, { speed: 0.9, life: 16, add: true });
        break;
      }
      case 'checkpoint':
        this.burst('ring', feet.x, feet.y - 4, [this.pal.accent[4]], 1, { speed: 0, life: 14, add: true });
        this.burst('star', feet.x, feet.y - 4, [this.pal.accent[4], this.pal.white], 5, { speed: 1, angle: -Math.PI / 2, spread: 2.4, life: 18, add: true });
        break;
      case 'custom:door_open': {
        const at = this.where(payload);
        this.burst('chunk', at.x, at.y, [this.pal.wood[2], this.pal.wood[3], this.pal.terrain[3]], 14, { speed: 1.4, ay: 0.07, life: 30 });
        this.burst('dot', at.x, at.y + 8, dust, 8, { speed: 0.8, life: 18 });
        break;
      }
      case 'custom:swing': {
        this.swingTick = sim.tick;
        const dx = Number(payload['dirX'] ?? p.facing);
        const dy = Number(payload['dirY'] ?? 0);
        // A finisher swings a bigger, golden arc; a dash-strike a long thrust.
        const kind = String(payload['kind'] ?? 'swing');
        const finisher = kind === 'finisher';
        const lunge = kind === 'lunge';
        const img = this.take('gg-slash')
          .setRotation(Math.atan2(dy, dx))
          .setDepth(400)
          .setTint(toInt(finisher ? this.pal.accent[4] : this.pal.white))
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(lunge ? 1.7 : finisher ? 1.5 : 1, lunge ? 0.8 : finisher ? 1.5 : 1);
        const reach = lunge ? 9 : finisher ? 6 : 4;
        const life = finisher || lunge ? 9 : 7;
        this.particles.push({ img, x: p.x + p.w / 2 + dx * reach, y: p.y + p.h / 2 + dy * reach, vx: dx * 0.35, vy: dy * 0.35, ay: 0, life, max: life, fade: true, at: sim.tick });
        if (finisher) this.burst('spark', p.x + p.w / 2 + dx * 10, p.y + p.h / 2 + dy * 10, [this.pal.accent[4], this.pal.white], 5, { speed: 1.4, angle: Math.atan2(dy, dx), spread: 1.4, life: 10, add: true });
        break;
      }
      case 'custom:windup': {
        const id = Number(payload['entity']);
        const e = sim.world.entities.find((x) => x.id === id);
        if (!e || !e.flags['boss']) break;
        const img = this.add.image(0, 0, 'gg-telegraph').setTint(toInt(this.pal.danger[3])).setBlendMode(Phaser.BlendModes.ADD).setDepth(55).setAlpha(0);
        this.telegraphs.push({ img, entity: id, from: sim.tick });
        break;
      }
      case 'custom:slam': {
        const at = this.where(payload);
        this.burst('ring', at.x, at.y + 4, [this.pal.danger[4]], 1, { speed: 0, life: 12, add: true });
        this.burst('chunk', at.x, at.y + 6, [this.pal.terrain[2], this.pal.terrain[3], this.pal.danger[2]], 14, { speed: 1.8, angle: -Math.PI / 2, spread: 3, ay: 0.08, life: 26 });
        this.burst('dot', at.x, at.y + 8, dust, 10, { speed: 1.2, angle: 0, spread: Math.PI * 2, life: 18 });
        break;
      }
      case 'custom:enrage': {
        const at = this.where(payload);
        this.burst('ring', at.x, at.y, [this.pal.danger[4]], 1, { speed: 0, life: 16, add: true });
        this.burst('spark', at.x, at.y, [this.pal.danger[4], this.pal.accent[4], this.pal.white], 16, { speed: 2, life: 22, add: true });
        break;
      }
      case 'custom:fire':
        this.burst('dot', p.x + p.w / 2, p.y, [this.pal.accent[4], this.pal.white], 2, { speed: 0.6, angle: -Math.PI / 2, spread: 0.8, life: 6, add: true });
        break;
      case 'push': {
        const at = this.where(payload);
        this.burst('dot', at.x, at.y + 6, dust, 4, { speed: 0.5, angle: Math.PI / 2, spread: 2.6, life: 14 });
        break;
      }
      // The farm's work: dirt off the hoe, a seed pressed in, drops from the can, a crop pulled with a leafy pop, coins.
      case 'custom:till': {
        const at = this.where(payload);
        this.burst('chunk', at.x, at.y + 1, [this.pal.wood[1], this.pal.wood[2], this.pal.wood[3]], 6, { speed: 0.9, angle: -Math.PI / 2, spread: 2.4, ay: 0.07, life: 16 });
        break;
      }
      case 'custom:plant': {
        const at = this.where(payload);
        this.burst('dot', at.x, at.y, [this.pal.rim[3], this.pal.wood[3]], 4, { speed: 0.5, angle: -Math.PI / 2, spread: 2, ay: 0.04, life: 12 });
        break;
      }
      case 'custom:water': {
        const at = this.where(payload);
        const drop = mix(this.pal.white, this.pal.garment[3], 0.35);
        this.burst('dot', at.x, at.y - 6, [drop, this.pal.white], 8, { speed: 0.6, angle: Math.PI / 2, spread: 1.2, ay: 0.08, life: 14 });
        this.burst('ring', at.x, at.y + 1, [drop], 1, { speed: 0, life: 10, add: true });
        break;
      }
      case 'custom:harvest': {
        const at = this.where(payload);
        const produce = typeof payload['color'] === 'string' && /^#[0-9a-f]{6}$/i.test(payload['color']) ? parseHex(payload['color']) : this.pal.accent[3];
        this.burst('chunk', at.x, at.y, [this.pal.rim[2], this.pal.rim[3]], 6, { speed: 1.1, angle: -Math.PI / 2, spread: 2.2, ay: 0.06, life: 18 });
        this.burst('star', at.x, at.y - 3, [produce, this.pal.white], 4, { speed: 0.9, angle: -Math.PI / 2, spread: 1.8, life: 18, add: true });
        break;
      }
      case 'custom:ship':
      case 'custom:buy': {
        const at = name === 'custom:ship' ? this.where(payload) : { x: feet.x, y: feet.y - 8 };
        this.burst('star', at.x, at.y - 2, [this.pal.accent[4], this.pal.white, this.pal.accent[3]], 6, { speed: 1, angle: -Math.PI / 2, spread: 1.6, life: 20, add: true });
        break;
      }
      case 'custom:no_seeds':
      case 'custom:too_tired':
      case 'custom:bin_empty': {
        const at = this.where(payload);
        this.burst('dot', at.x, at.y - 2, [this.pal.ui[2], this.pal.terrain[3]], 3, { speed: 0.4, angle: -Math.PI / 2, spread: 1.4, life: 12 });
        break;
      }
      case 'custom:sleep':
        if (this.controller.mode === 'realtime') this.sleepFrom = performance.now();
        break;
      // Menus are UI: they always sound, whatever the feedback table says.
      case 'menu_open':
        this.sfx.play('menu_open');
        break;
      case 'menu_choose':
        this.sfx.play(payload['option'] === null ? 'select' : 'menu_pick');
        if (payload['option'] !== null) this.burst('star', feet.x, feet.y - 6, [this.pal.accent[4], this.pal.white, this.pal.accent[3]], 10, { speed: 1.3, angle: -Math.PI / 2, spread: 2.6, life: 26, add: true });
        break;
      default:
        break;
    }
  }

  /** The feedback table's particle channel: the big bursts (pickups, wins, dashes, pushes). */
  private celebrate(source: string): void {
    const at = this.where(this.lastEvent.get(source) ?? {});
    switch (source) {
      case 'pickup':
        this.burst('star', at.x, at.y, [this.pal.accent[4], this.pal.white, this.pal.accent[3]], 8, { speed: 1.4, life: 20, add: true });
        this.burst('ring', at.x, at.y, [this.pal.accent[4]], 1, { speed: 0, life: 12, add: true });
        break;
      case 'level_complete': {
        const p = this.controller.sim.world.player;
        this.burst('chunk', p.x + p.w / 2, p.y, [this.pal.accent[3], this.pal.danger[3], this.pal.garment[3], this.pal.white], 28, { speed: 2.4, angle: -Math.PI / 2, spread: 2.2, ay: 0.07, life: 50 });
        break;
      }
      case 'dash':
        this.burst('spark', at.x, at.y, [this.pal.garment[4], this.pal.white], 6, { speed: 1.1, life: 12, add: true });
        break;
      default:
        this.burst('spark', at.x, at.y, [this.pal.white, this.pal.accent[3]], 6, { speed: 1.2, life: 14, add: true });
        break;
    }
  }

  // ---------------------------------------------------------------- HUD, banners, screens

  private drawHud(): void {
    const w = this.controller.sim.world;
    const p = w.player;
    const levels = this.controller.options.levels.length;
    const entries: Array<{ icon?: string; text: string }> = [];
    for (const [k, v] of Object.entries(w.hud)) {
      const key = k.toLowerCase();
      // hp is drawn as hearts; a key starting with _ is for the view (a farm's clock as minutes), not the player.
      if (key === 'hp' || key.startsWith('_')) continue;
      const icon = HUD_KEY_ICONS[key];
      entries.push({ icon, text: icon ? String(v).toUpperCase() : `${k.toUpperCase()} ${String(v).toUpperCase()}` });
    }
    if (w.score > 0 || entries.length === 0) entries.unshift({ icon: 'star', text: String(w.score) });
    const sig = JSON.stringify([p.hp, p.maxHp, entries, this.controller.levelIndex, levels]);
    if (sig === this.hudSig) return;
    this.hudSig = sig;
    const pc = new PixelCanvas(this.style.canvas.w, HUD_H);
    let x = 3;
    if (p.maxHp > 1) {
      for (let i = 0; i < p.maxHp; i++) {
        const heart = this.icons.get(i < p.hp ? 'heart' : 'heart0')!;
        pc.blit(heart, x, 2);
        x += heart.w - 1;
      }
      x += 4;
    }
    const counter = levels > 1 ? this.text(`${this.controller.levelIndex + 1}/${levels}`, this.pal.ui[3]) : null;
    // A row too wide for the HUD (a long name beside a large purse) gives up letters rather than running under the
    // level counter or off the screen. Each entry takes its icon, the text's outline and the gap after it.
    const iconW = (e: (typeof entries)[number]) => (e.icon ? (this.icons.get(e.icon)?.w ?? 0) : 0);
    const room = (counter ? this.style.canvas.w - counter.w - 7 : this.style.canvas.w - 3) - x + 5;
    const texts = fitRow(entries.map((e) => e.text), room, entries.map((e) => iconW(e) + 2 + 5));
    entries.forEach((e, i) => {
      const icon = e.icon ? this.icons.get(e.icon) : undefined;
      if (icon) {
        pc.blit(icon, x, 2 + Math.floor((9 - icon.h) / 2));
        x += icon.w;
      }
      const t = this.text(texts[i]!, this.pal.white);
      pc.blit(t, x, 2);
      x += t.w + 5;
    });
    if (counter) pc.blit(counter, this.style.canvas.w - counter.w - 3, 2);
    this.repaint(this.hudTex, pc);
    this.hudImg.setVisible(true);
  }

  /**
   * A farm's light through the day (from the clock's minutes, multiplied over the world), the dark of a night's sleep,
   * and the cursor on the tile the farmer faces. The light follows the sim, so a frame at a tick always looks the same;
   * the sleep's dark runs on real time, so a stepped game (bots, screenshots) never sees it.
   */
  private stepFarm(): void {
    const w = this.controller.sim.world;
    const play = this.controller.scene === 'play';
    const minute = w.hud['_minute'];
    if (play && typeof minute === 'number') this.dayImg.setTint(toInt(daylight(minute))).setVisible(true);
    else this.dayImg.setVisible(false);
    const t = this.sleepFrom < 0 ? -1 : performance.now() - this.sleepFrom;
    if (t >= 1250) this.sleepFrom = -1;
    this.sleepImg.setAlpha(t < 0 || t >= 1250 ? 0 : t < 350 ? t / 350 : t < 650 ? 1 : 1 - (t - 650) / 600);
    const p = w.player;
    const tx = p.props['targetTx'];
    const ty = p.props['targetTy'];
    if (play && !w.menu && p.alive && typeof tx === 'number' && typeof ty === 'number') {
      const ts = this.controller.sim.map.tileSize;
      this.cursorImg
        .setPosition(tx * ts + ts / 2, ty * ts + ts / 2)
        .setDepth(100 + (ty + 1) * ts + 0.5)
        .setTint(toInt(this.pal.white))
        .setAlpha(0.5 + 0.25 * Math.sin(this.animTick / 9))
        .setVisible(true);
    } else this.cursorImg.setVisible(false);
  }

  /** Telegraphs grow brighter as the attack nears and go when the attacker stops winding up. */
  private stepTelegraphs(tick: number): void {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i]!;
      const e = this.controller.sim.world.entities.find((x) => x.id === t.entity);
      if (!e || !e.alive || e.anim !== 'windup') {
        t.img.destroy();
        this.telegraphs.splice(i, 1);
        continue;
      }
      const k = Math.min(1, (tick - t.from) / 36);
      t.img
        .setPosition(Math.round(e.x + e.w / 2), Math.round(e.y + e.h / 2))
        .setAlpha(0.18 + 0.5 * k + (tick % 6 < 3 ? 0.08 : 0))
        .setScale(0.9 + 0.1 * k);
    }
  }

  /** The engaged boss's name and health along the bottom: what a hit took shows as a pale stretch that drains away. */
  private drawBossBar(ticks: number): void {
    const sim = this.controller.sim;
    const p = sim.world.player;
    const boss = sim.world.entities.find((e) => e.alive && e.flags['boss'] && e.fsm && e.fsm.state !== '' && e.fsm.state !== this.initialState(e.fsm.id));
    if (!boss) {
      this.bossImg.setVisible(false);
      this.bossSig = '';
      return;
    }
    const trail = this.bossTrail;
    if (trail.id !== boss.id) Object.assign(trail, { id: boss.id, hp: boss.hp, seen: boss.hp, hold: 0 });
    // A new hit holds the pale stretch a moment (consecutive hits keep holding it), then it drains to the health left.
    if (boss.hp < trail.seen) trail.hold = 24;
    trail.seen = boss.hp;
    if (trail.hp <= boss.hp) trail.hp = boss.hp;
    else if (trail.hold > 0) trail.hold -= ticks;
    else trail.hp = Math.max(boss.hp, trail.hp - 0.35 * ticks);
    const name = String(boss.props['name'] ?? boss.type).toUpperCase();
    const sig = JSON.stringify([name, boss.hp, boss.maxHp, Math.round(trail.hp * 4), p.alive]);
    if (sig === this.bossSig) return;
    this.bossSig = sig;
    const { w: cw } = this.style.canvas;
    const pal = this.pal;
    const pc = new PixelCanvas(cw, BOSS_H);
    const bw = Math.min(180, cw - 80);
    const bx = Math.round((cw - bw) / 2);
    const by = 11;
    const label = this.text(name, pal.white);
    pc.blit(label, Math.round((cw - label.w) / 2), 0);
    pc.fillRect(bx - 1, by - 1, bw + 2, 6, pal.ink);
    pc.fillRect(bx, by, bw, 4, mix(pal.ink, pal.danger[0], 0.6));
    const fill = Math.round((bw * Math.max(0, boss.hp)) / boss.maxHp);
    const lost = Math.round((bw * Math.max(0, trail.hp)) / boss.maxHp);
    if (lost > fill) pc.fillRect(bx + fill, by, lost - fill, 4, mix(pal.white, pal.danger[3], 0.35));
    pc.fillRect(bx, by, fill, 4, pal.danger[2]);
    pc.fillRect(bx, by, fill, 1, pal.danger[4]);
    pc.fillRect(bx, by + 3, fill, 1, pal.danger[1]);
    // Notches at each quarter, and a brighter one at half health (where the boss enrages).
    for (const q of [0.25, 0.5, 0.75]) pc.fillRect(bx + Math.round(bw * q), by, 1, 4, q === 0.5 ? pal.accent[3] : pal.ink, q === 0.5 ? 255 : 160);
    this.repaint(this.bossTex, pc);
    this.bossImg.setVisible(true);
  }

  private initialState(fsmId: string): string {
    return this.controller.options.simOptions.behaviours?.find((b) => b.id === fsmId)?.initial ?? '';
  }

  private showBanner(): void {
    const name = (this.controller.level.name ?? '').toUpperCase();
    const levels = this.controller.options.levels.length;
    const named = name !== '' && !/^LEVEL \d+$/.test(name);
    const text = levels > 1 ? `LEVEL ${this.controller.levelIndex + 1}${named ? ` · ${name}` : ''}` : named ? name : '';
    if (!text) return;
    const pc = this.text(text, this.pal.white);
    this.addCanvasTexture('gg-banner', pc);
    this.bannerImg = this.add.image(Math.round((this.style.canvas.w - pc.w) / 2), 20, 'gg-banner').setOrigin(0).setScrollFactor(0).setDepth(10_500).setAlpha(0);
  }

  /** Banner and fade-in follow the level's ticks, so a screenshot at a given tick always looks the same. */
  private updateIntro(tick: number): void {
    this.fadeImg.setAlpha(this.controller.scene === 'play' ? Math.max(0, 1 - tick / 16) : 0);
    if (!this.bannerImg) return;
    const shown = this.controller.scene === 'play' && tick < BANNER_TICKS;
    const a = !shown ? 0 : tick < 15 ? tick / 15 : tick > BANNER_TICKS - 20 ? (BANNER_TICKS - tick) / 20 : 1;
    this.bannerImg.setAlpha(a).setY(Math.round(16 + 4 * (1 - Math.min(1, tick / 15))));
  }

  private drawOverlay(): void {
    const scene = this.controller.scene;
    const w = this.controller.sim.world;
    if (scene === 'play' && w.menu) {
      this.drawMenu(w.menu);
      return;
    }
    this.menuSeen = '';
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    const title = (this.style.title ?? '').toUpperCase();
    const lines: Array<{ text: string; scale: number; color: RGB; gap?: number }> = [];
    let dim = 0;
    if (scene === 'title') {
      dim = 0.55;
      if (title) lines.push({ text: title, scale: title.length > 18 ? 1 : 2, color: this.pal.accent[4], gap: 10 });
      lines.push({ text: blink ? 'PRESS ENTER' : '', scale: 1, color: this.pal.white });
    } else if (scene === 'results') {
      dim = 0.6;
      lines.push({ text: 'ALL CLEAR!', scale: 2, color: this.pal.accent[4], gap: 8 });
      lines.push({ text: `SCORE ${w.score}${w.deaths ? ` · DEATHS ${w.deaths}` : ''}`, scale: 1, color: this.pal.white, gap: 10 });
      lines.push({ text: blink ? 'PRESS ENTER TO PLAY AGAIN' : '', scale: 1, color: this.pal.ui[3] });
    } else if (w.flags.won) {
      lines.push({ text: this.setting === 'farm' ? 'QUOTA MET!' : 'LEVEL CLEAR', scale: 2, color: this.pal.accent[4] });
    } else if (w.flags.gameOver) {
      dim = 0.5;
      lines.push({ text: this.setting === 'farm' ? 'SEASON OVER' : 'GAME OVER', scale: 2, color: this.pal.danger[3], gap: 8 });
      if (this.controller.mode === 'realtime') lines.push({ text: blink ? 'PRESS ENTER TO RETRY' : '', scale: 1, color: this.pal.white });
    } else if (w.flags.paused) {
      dim = 0.45;
      lines.push({ text: 'PAUSED', scale: 2, color: this.pal.white });
    }
    const sig = JSON.stringify([dim, lines]);
    if (sig === this.overlaySig) return;
    this.overlaySig = sig;
    if (lines.length === 0) {
      this.overlayImg.setVisible(false);
      return;
    }
    const { w: cw, h: ch } = this.style.canvas;
    const pc = new PixelCanvas(cw, ch);
    if (dim > 0) pc.fillRect(0, 0, cw, ch, this.pal.ink, Math.round(dim * 255));
    const images = lines.map((l) => (l.text ? this.text(l.text, l.color, l.scale, l.scale > 1 ? mix(l.color, this.pal.accent[1], 0.4) : undefined) : null));
    const height = (img: PixelCanvas | null, i: number) => (img?.h ?? 9) + (i < lines.length - 1 ? (lines[i]!.gap ?? 4) : 0);
    let y = Math.round((ch - images.reduce((n, img, i) => n + height(img, i), 0)) / 2);
    images.forEach((img, i) => {
      if (img) pc.blit(img, Math.round((cw - img.w) / 2), y);
      y += height(img, i);
    });
    this.repaint(this.overlayTex, pc);
    this.overlayImg.setVisible(true);
  }

  private drawMenu(menu: Menu): void {
    const seen = `${menu.id}|${menu.openedTick}`;
    if (this.menuSeen.startsWith(`${seen}|`) && this.menuSeen !== `${seen}|${menu.selected}`) this.sfx.play('select');
    this.menuSeen = `${seen}|${menu.selected}`;
    const sig = JSON.stringify(['menu', menu]);
    if (sig === this.overlaySig) return;
    this.overlaySig = sig;
    const { w: cw, h: ch } = this.style.canvas;
    const pc = new PixelCanvas(cw, ch);
    pc.fillRect(0, 0, cw, ch, this.pal.ink, 165);
    this.paintMenu(pc, menu);
    this.repaint(this.overlayTex, pc);
    this.overlayImg.setVisible(true);
  }

  /** An in-game choice (boons, upgrades, a shop): the title, one card per option, the highlighted card lifted and lit. */
  private paintMenu(pc: PixelCanvas, menu: Menu): void {
    const { w: cw, h: ch } = this.style.canvas;
    const pal = this.pal;
    const title = this.text(menu.title.toUpperCase(), pal.accent[4], 2, mix(pal.accent[4], pal.accent[1], 0.4));
    pc.blit(title, Math.round((cw - title.w) / 2), 12);
    const n = menu.options.length;
    const gap = 8;
    const cardW = Math.min(88, Math.floor((cw - 24 - (n - 1) * gap) / n));
    const cardH = Math.min(106, ch - 62);
    const x0 = Math.round((cw - (n * cardW + (n - 1) * gap)) / 2);
    const y0 = 38;
    menu.options.forEach((opt, i) => {
      const sel = i === menu.selected;
      const x = x0 + i * (cardW + gap);
      const y = y0 - (sel ? 3 : 0);
      // The card: the game's warm mid tone, lighter at the top, a lit top edge and a dark lip.
      const top = mix(pal.ink, pal.terrain[sel ? 2 : 1], sel ? 0.72 : 0.55);
      const bottom = mix(pal.ink, pal.terrain[1], sel ? 0.4 : 0.28);
      for (let r = 0; r < cardH; r++) pc.fillRect(x, y + r, cardW, 1, mix(top, bottom, r / cardH), 250);
      const edge = sel ? pal.accent[3] : mix(pal.ink, pal.terrain[2], 0.8);
      pc.fillRect(x, y, cardW, 1, edge);
      pc.fillRect(x, y + cardH - 1, cardW, 1, edge);
      pc.fillRect(x, y, 1, cardH, edge);
      pc.fillRect(x + cardW - 1, y, 1, cardH, edge);
      pc.fillRect(x + 1, y + 1, cardW - 2, 1, sel ? pal.accent[4] : mix(pal.ink, pal.terrain[3], 0.6));
      pc.fillRect(x + 1, y + cardH - 2, cardW - 2, 1, pal.ink, 160);
      if (sel) {
        // Corner ticks outside the card, like a cursor.
        for (const [cx, cy, dx, dy] of [[x - 2, y - 2, 1, 1], [x + cardW + 1, y - 2, -1, 1], [x - 2, y + cardH + 1, 1, -1], [x + cardW + 1, y + cardH + 1, -1, -1]] as const) {
          pc.fillRect(Math.min(cx, cx + dx * 3), cy, 4, 1, pal.accent[4]);
          pc.fillRect(cx, Math.min(cy, cy + dy * 3), 1, 4, pal.accent[4]);
        }
      }
      // A medallion for the icon: an ink disc in a gold ring (brighter on the highlighted card).
      const mx = x + Math.floor(cardW / 2);
      const my = y + 18;
      for (let dy = -13; dy <= 13; dy++) {
        for (let dx = -13; dx <= 13; dx++) {
          const r = Math.hypot(dx + 0.5, dy + 0.5);
          if (r > 13) continue;
          pc.set(mx + dx, my + dy, r > 11.5 ? (sel ? pal.accent[3] : pal.accent[1]) : r > 10.5 ? pal.ink : mix(pal.ink, pal.terrain[1], 0.35 - (dy / 13) * 0.15));
        }
      }
      const icon = opt.icon ? this.icons.get(opt.icon) : undefined;
      if (icon) pc.blitScaled(icon, mx - icon.w + 1, my - icon.h + 1, 2);
      let ty = y + 36;
      for (const line of wrapText(opt.label.toUpperCase(), cardW - 6).slice(0, 2)) {
        const t = this.text(line, sel ? pal.white : pal.ui[3]);
        pc.blit(t, x + Math.round((cardW - t.w) / 2), ty);
        ty += 9;
      }
      pc.fillRect(x + 10, ty + 1, cardW - 20, 1, sel ? pal.accent[2] : mix(pal.ink, pal.terrain[3], 0.45));
      ty += 5;
      // As many lines of detail as the card has room for, above the price when there is one.
      const rest = Math.max(1, Math.floor((y + cardH - (opt.cost !== undefined ? 15 : 4) - ty) / 9));
      for (const line of wrapText((opt.detail ?? '').toUpperCase(), cardW - 8).slice(0, rest)) {
        const t = this.text(line, sel ? pal.ui[3] : pal.ui[2]);
        pc.blit(t, x + Math.round((cardW - t.w) / 2), ty);
        ty += 9;
      }
      if (opt.cost !== undefined) {
        const coin = this.icons.get('coin')!;
        const price = this.text(String(opt.cost), opt.disabled ? pal.danger[3] : pal.accent[4]);
        const px = x + Math.round((cardW - coin.w - price.w) / 2);
        pc.blit(coin, px, y + cardH - 13);
        pc.blit(price, px + coin.w, y + cardH - 13);
      }
      // An option out of reach (a pack the purse cannot pay for) stays readable, dimmed.
      if (opt.disabled) pc.tint(x + 1, y + 1, cardW - 2, cardH - 2, pal.ink, 0.5);
    });
    const hint = this.text(`< > TO CHOOSE · ENTER TO TAKE${menu.cancellable ? ' · X TO LEAVE' : ''}`, pal.ui[2]);
    pc.blit(hint, Math.round((cw - hint.w) / 2), Math.min(ch - 11, y0 + cardH + 6));
  }

  // ---------------------------------------------------------------- frame

  override update(_time: number, delta: number): void {
    // Hitstop is a render-side pause: realtime frames are skipped while it lasts; manual stepping is unaffected.
    if (performance.now() < this.hitstopUntil && this.controller.mode === 'realtime') {
      this.controller.metrics.record(delta);
      return;
    }
    this.controller.frame(delta);
    const sim = this.controller.sim;
    const tick = sim.tick;
    if (sim.map.version !== this.drawnVersion || (this.setting === 'dungeon' && this.exitLocked() !== this.drawnExitLocked)) this.buildTiles();
    const p = sim.world.player;
    this.followTarget.x = Math.round(p.x + p.w / 2);
    this.followTarget.y = Math.round(p.y + p.h / 2);
    this.syncEntities();
    this.stepParticles(tick);
    this.animTick = this.controller.mode === 'realtime' ? this.animTick + delta / (1000 / 60) : tick;
    const cam = this.cameras.main;
    for (const l of this.layers) {
      l.obj.tilePositionX = Math.round(cam.scrollX * l.fx + this.animTick * l.driftX);
      if (l.horizon) l.obj.setY(Math.round((this.horizonY - cam.scrollY) * l.fy));
      else l.obj.tilePositionY = Math.round(cam.scrollY * l.fy + this.animTick * l.driftY);
    }
    const { w: vw, h: vh } = this.style.canvas;
    for (const m of this.motes) {
      const t = this.animTick;
      const x = (((m.x + t * m.vx + Math.sin(t / 50 + m.phase) * 6 - cam.scrollX * 0.6) % vw) + vw) % vw;
      const y = (((m.y + t * m.vy + Math.cos(t / 63 + m.phase) * 4 - cam.scrollY * 0.6) % vh) + vh) % vh;
      m.img.setPosition(Math.round(x), Math.round(y)).setAlpha(0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t / 23 + m.phase * 3)));
    }
    for (const d of this.decor) {
      d.img.setFrame(d.frames[Math.floor(((this.animTick + d.phase * 7) * this.fps.effects) / 60) % d.frames.length]!);
      d.glow?.setAlpha(0.3 + 0.08 * Math.sin(this.animTick / 5 + d.phase));
    }
    this.stepTelegraphs(tick);
    this.stepFarm();
    if (this.controller.scene === 'play') {
      this.drawHud();
      this.drawBossBar(Math.min(60, Math.max(0, tick - this.lastBossTick)));
    } else {
      this.hudImg.setVisible(false);
      this.bossImg.setVisible(false);
    }
    this.lastBossTick = tick;
    this.updateIntro(tick);
    this.drawOverlay();
  }
}

/** HUD icons, keyed by the names games give their HUD values. */
const HUD_ICONS: Record<string, readonly string[]> = {
  heart: ['.ee.ee.', 'eEEeDDd', 'eEDDDDd', '.dDDDd.', '..dDd..', '...d...'],
  heart0: ['.tt.tt.', 't..t..t', 't.....t', '.t...t.', '..t.t..', '...t...'],
  star: ['..b..', '.bBb.', 'bBBBb', '.AbA.', 'A...A'],
  coin: ['.bAa.', 'bBAAa', 'bAbAa', 'bAAAa', '.aAa.'],
  gem: ['..b..', '.bBA.', 'bBAAa', '.AAa.', '..a..'],
  crystal: ['.nN.', 'nNMm', '.Mm.', '.m..'],
  skull: ['.www.', 'wwwww', 'wkwkw', '.www.', '.w.w.'],
  door: ['.TTT.', 'TtttT', 'TtAtT', 'TtttT', 'TtttT'],
  clock: ['.www.', 'w.k.w', 'w.kkw', 'w...w', '.www.'],
  flag: ['UAAA', 'UAbA', 'UAAA', 'U...', 'U...'],
  crate: ['qqqqq', 'qRrRq', 'qrQrq', 'qRrRq', 'qqqqq'],
  target: ['.bbb.', 'b...b', 'b.A.b', 'b...b', '.bbb.'],
  foot: ['.ww.', '.ww.', 'www.', 'www.', '.w..'],
  bolt: ['..bB', '.bB.', 'bBBb', '.bB.', 'bB..'],
  key: ['.bA..', 'b.aA.', '.aA..', '..AA.', '..Aa.'],
  flame: ['..E..', '.eE..', '.eEe.', 'eEBEe', 'eBwBe', '.eBe.'],
  sword: ['..w..', '..U..', '..U..', '..U..', 'bBBBb', '..q..', '..q..'],
  hammer: ['tTTTt', 'tUUUt', 'tTTTt', '..q..', '..q..', '..q..'],
  sun: ['b.b.b', '.bBb.', 'bBBBb', '.bBb.', 'b.b.b'],
  seed: ['.y.Y.', '.yVy.', '..V..', '.qrq.', 'qqqqq'],
  moon: ['..bB.', '.bB..', '.bB..', '.bB..', '..bB.'],
};
const HUD_KEY_ICONS: Record<string, string> = {
  coins: 'coin',
  coin: 'coin',
  gems: 'gem',
  gem: 'gem',
  xp: 'crystal',
  level: 'crystal',
  enemies: 'skull',
  kills: 'skull',
  exit: 'door',
  time: 'clock',
  timer: 'clock',
  wave: 'flag',
  pushes: 'crate',
  placed: 'target',
  moves: 'foot',
  power: 'bolt',
  relics: 'gem',
  keys: 'key',
  boons: 'flame',
  day: 'sun',
  gold: 'coin',
  quota: 'target',
  energy: 'bolt',
  seeds: 'seed',
};

export function createPhaserGame(controller: GameController, style: ViewStyle, parent: HTMLElement | string | undefined, onCreated: () => void): { game: Phaser.Game; scene: MainScene } {
  const scene = new MainScene(controller, style, onCreated);
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
    scene: [scene],
  };
  return { game: new Phaser.Game(config), scene };
}

/**
 * The colour a farm's world is multiplied by at a time of day (minutes since midnight, past 24:00 at night): a rosy
 * dawn, plain daylight, a warm dusk from four, deep blue night from nine.
 */
function daylight(minute: number): RGB {
  const dawn: RGB = [255, 228, 214];
  const day: RGB = [255, 255, 255];
  const dusk: RGB = [255, 206, 160];
  const night: RGB = [92, 104, 170];
  if (minute < 7.5 * 60) return mix(dawn, day, Math.max(0, (minute - 6 * 60) / 90));
  if (minute < 16 * 60) return day;
  if (minute < 19 * 60) return mix(day, dusk, (minute - 16 * 60) / 180);
  if (minute < 21 * 60) return mix(dusk, night, (minute - 19 * 60) / 120);
  return night;
}
