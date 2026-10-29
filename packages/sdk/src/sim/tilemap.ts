import type { LevelJson, TileKind } from '@gg/schemas';

/**
 * Tile grid built from a LevelJson. Coordinates in tiles unless suffixed Px. Levels are data; systems may change a
 * tile at runtime (a door opening) through setKind, and every change bumps `version` so views know to redraw.
 */
export class Tilemap {
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  private readonly kinds: TileKind[];
  private changes = 0;

  constructor(public readonly level: LevelJson) {
    this.width = level.width;
    this.height = level.height;
    this.tileSize = level.tileSize;
    this.kinds = new Array<TileKind>(this.width * this.height).fill('air');
    for (let y = 0; y < this.height; y++) {
      const row = level.rows[y] ?? '';
      for (let x = 0; x < this.width; x++) {
        const ch = row[x] ?? '.';
        this.kinds[y * this.width + x] = level.legend[ch] ?? 'air';
      }
    }
  }

  /** Number of runtime tile changes since the level loaded (0 for a level as authored). */
  get version(): number {
    return this.changes;
  }

  /** Change one tile at runtime. Out-of-bounds and no-op changes are ignored. Deterministic: systems call it from fixedUpdate. */
  setKind(tx: number, ty: number, kind: TileKind): void {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return;
    const i = ty * this.width + tx;
    if (this.kinds[i] === kind) return;
    this.kinds[i] = kind;
    this.changes++;
  }

  get pixelWidth(): number {
    return this.width * this.tileSize;
  }

  get pixelHeight(): number {
    return this.height * this.tileSize;
  }

  /** Tile kind at tile coords; out-of-bounds counts as solid (walls) except above the top (air). */
  kindAt(tx: number, ty: number): TileKind {
    if (ty < 0) return 'air';
    if (tx < 0 || tx >= this.width || ty >= this.height) return 'solid';
    return this.kinds[ty * this.width + tx] ?? 'air';
  }

  kindAtPx(px: number, py: number): TileKind {
    return this.kindAt(Math.floor(px / this.tileSize), Math.floor(py / this.tileSize));
  }

  /** True if any tile overlapping the AABB [x, x+w) x [y, y+h) matches the predicate. */
  overlaps(x: number, y: number, w: number, h: number, pred: (kind: TileKind) => boolean): boolean {
    const ts = this.tileSize;
    const x0 = Math.floor(x / ts);
    const x1 = Math.floor((x + w - 1e-6) / ts);
    const y0 = Math.floor(y / ts);
    const y1 = Math.floor((y + h - 1e-6) / ts);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (pred(this.kindAt(tx, ty))) return true;
    return false;
  }

  isSolid(x: number, y: number, w: number, h: number): boolean {
    return this.overlaps(x, y, w, h, (k) => k === 'solid');
  }

  isHazard(x: number, y: number, w: number, h: number): boolean {
    return this.overlaps(x, y, w, h, (k) => k === 'hazard');
  }

  isGoal(x: number, y: number, w: number, h: number): boolean {
    return this.overlaps(x, y, w, h, (k) => k === 'goal');
  }

  /** One-way platforms block only when moving down and the feet were above the platform top. */
  isOneWayBelow(x: number, feetY: number, w: number, prevFeetY: number): boolean {
    const ts = this.tileSize;
    const ty = Math.floor(feetY / ts);
    const top = ty * ts;
    if (prevFeetY > top + 1e-6) return false;
    const x0 = Math.floor(x / ts);
    const x1 = Math.floor((x + w - 1e-6) / ts);
    for (let tx = x0; tx <= x1; tx++) if (this.kindAt(tx, ty) === 'oneway') return true;
    return false;
  }
}
