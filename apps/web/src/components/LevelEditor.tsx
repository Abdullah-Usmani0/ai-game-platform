'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Heatmap, HeatCell } from '@gg/db';
import type { BehaviourFsm, LevelJson, SystemsJson, TileKind } from '@gg/schemas';
import type { GenreCheck, LevelCheck } from '@gg/template-core';
import { FLAG, PixelCanvas, RECIPES, TYPE_RECIPES, artPalette, paintFrames, paintRegion, prepareLevelArt, settingFor, type Anchor, type ArtPalette, type OutlineMode, type PaletteRoles, type Recipe, type Setting } from '@gg/sdk/art';

/** content/index.json of a published bundle (written by the publisher). */
interface ContentIndex {
  levels: string[];
  behaviour: string[];
  rules?: string[];
  files: string[];
}

interface Loaded {
  levels: LevelJson[];
  systems: SystemsJson;
  behaviours: BehaviourFsm[];
  feedback: unknown[];
  content: Record<string, unknown>;
}

type Tool =
  | { kind: 'tile'; tile: TileKind }
  | { kind: 'entity'; type: string }
  | { kind: 'erase' }
  | { kind: 'spawn' }
  | { kind: 'goal' };

const KINDS: TileKind[] = ['air', 'solid', 'hazard', 'oneway', 'goal', 'spawn'];
const DEFAULT_CHARS: Record<TileKind, string> = {
  air: '.',
  solid: '#',
  hazard: '^',
  oneway: '-',
  goal: 'G',
  spawn: 'S',
};
const COLORS: Record<TileKind, string> = {
  air: '#11111f',
  solid: '#5a5a78',
  hazard: '#ef476f',
  oneway: '#8fb996',
  goal: '#ffd166',
  spawn: '#4cc9f0',
};
const ENTITY_COLORS = ['#f78c6b', '#c792ea', '#82aaff', '#ffcb6b', '#89ddff', '#f07178', '#c3e88d'];
const SPARE_CHARS = 'abcdefhijklmnopqrstuvwxyz0123456789*+=%&@';

/** The legend character for a tile kind, adding one to the legend when the level has none yet. */
function charFor(level: LevelJson, kind: TileKind): { char: string; legend: LevelJson['legend'] } {
  for (const [ch, k] of Object.entries(level.legend))
    if (k === kind) return { char: ch, legend: level.legend };
  const used = new Set(Object.keys(level.legend));
  const char = !used.has(DEFAULT_CHARS[kind])
    ? DEFAULT_CHARS[kind]
    : [...SPARE_CHARS].find((c) => !used.has(c));
  if (!char) throw new Error('legend is full');
  return { char, legend: { ...level.legend, [char]: kind } };
}

function kindAt(level: LevelJson, x: number, y: number): TileKind | null {
  const ch = level.rows[y]?.[x];
  return ch ? (level.legend[ch] ?? null) : null;
}

function withTile(level: LevelJson, x: number, y: number, kind: TileKind): LevelJson {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height || kindAt(level, x, y) === kind)
    return level;
  const { char, legend } = charFor(level, kind);
  const rows = level.rows.slice();
  const row = rows[y]!;
  rows[y] = row.slice(0, x) + char + row.slice(x + 1);
  return { ...level, legend, rows };
}

/** Move the spawn or the goal: the old marker tile becomes air, the new tile takes the marker. */
function withMarker(level: LevelJson, marker: 'spawn' | 'goal', x: number, y: number): LevelJson {
  const old = level[marker];
  let next = kindAt(level, old.x, old.y) === marker ? withTile(level, old.x, old.y, 'air') : level;
  next = withTile(next, x, y, marker);
  return { ...next, [marker]: { x, y } };
}

function withEntity(level: LevelJson, x: number, y: number, type: string): LevelJson {
  const entities = level.entities.filter((e) => !(e.x === x && e.y === y));
  return { ...level, entities: [...entities, { type, x, y, props: {} }] };
}

function withoutEntity(level: LevelJson, x: number, y: number): LevelJson {
  const entities = level.entities.filter((e) => !(e.x === x && e.y === y));
  return entities.length === level.entities.length ? level : { ...level, entities };
}

function colorForType(type: string, types: string[]): string {
  const i = Math.max(0, types.indexOf(type));
  return ENTITY_COLORS[i % ENTITY_COLORS.length]!;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

/** A pixel canvas on a browser canvas, to draw scaled with smoothing off. */
function canvasOf(pc: PixelCanvas): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = pc.w;
  c.height = pc.h;
  c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pc.data), pc.w, pc.h), 0, 0);
  return c;
}

/** The game's look, from its style card: the editor paints levels with the same art kit the game is drawn with. */
export interface EditorLook {
  palette: PaletteRoles;
  outline?: OutlineMode;
}

interface LevelArt {
  /** The draft this was painted from; tiles edited since are drawn flat until the next repaint. */
  level: LevelJson;
  pal: ArtPalette;
  setting: Setting;
  image: HTMLCanvasElement;
}

/** The level being edited with its undo history. A reducer keeps every transition pure (Strict Mode replays them). */
interface EditorState {
  draft: LevelJson | null;
  history: LevelJson[];
  dirty: boolean;
}
type EditorAction =
  | { type: 'load'; level: LevelJson | null }
  | { type: 'edit'; fn: (l: LevelJson) => LevelJson }
  | { type: 'undo' }
  | { type: 'saved' };
const EMPTY_EDITOR: EditorState = { draft: null, history: [], dirty: false };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load':
      return {
        draft: action.level ? structuredClone(action.level) : null,
        history: [],
        dirty: false,
      };
    case 'edit': {
      if (!state.draft) return state;
      const next = action.fn(state.draft);
      if (next === state.draft) return state;
      return { draft: next, history: [...state.history.slice(-99), state.draft], dirty: true };
    }
    case 'undo': {
      const prev = state.history[state.history.length - 1];
      return prev ? { draft: prev, history: state.history.slice(0, -1), dirty: true } : state;
    }
    case 'saved':
      return { ...state, dirty: false };
    default:
      return state;
  }
}

/**
 * Tile and entity editor over the head version's levels. "Check" runs the gate's own validator and solver bot in the
 * page (the genre check kit); "Apply" sends the level as authored content, which the worker verifies again, plays,
 * builds and publishes as a new version. No model call anywhere on this path.
 */
export function LevelEditor({
  genre,
  bundleBase,
  disabled,
  onApply,
  heatSrc,
  look,
}: {
  genre: string;
  bundleBase: string;
  disabled: boolean;
  onApply: (content: { levels: LevelJson[] }, message: string) => void;
  /** The owner's heatmap of this version (/api/games/<id>/heatmap?version=<id>); the overlay is offered when set. */
  heatSrc?: string;
  /** Paint the level as the game draws it; without it tiles are flat colours. */
  look?: EditorLook;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kit, setKit] = useState<GenreCheck | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [{ draft, history, dirty }, dispatch] = useReducer(editorReducer, EMPTY_EDITOR);
  const [tool, setTool] = useState<Tool>({ kind: 'tile', tile: 'solid' });
  const [entityType, setEntityType] = useState<string>('');
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  // A check result belongs to the exact draft it ran on; any later edit makes it stale.
  const [checked, setChecked] = useState<{ level: LevelJson; result: LevelCheck } | null>(null);
  const check = checked && checked.level === draft ? checked.result : null;
  const [checking, setChecking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const [heatOn, setHeatOn] = useState(false);
  const [heat, setHeat] = useState<Heatmap | null>(null);
  const [heatError, setHeatError] = useState<string | null>(null);

  // Load the bundle's content and the genre's check kit (validator + solver, browser-safe).
  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setLoadError(null);
    dispatch({ type: 'load', level: null });
    (async () => {
      try {
        const index = await fetchJson<ContentIndex>(`${bundleBase}/content/index.json`);
        const [levels, behaviours, systems, feedback, files] = await Promise.all([
          Promise.all(index.levels.map((f) => fetchJson<LevelJson>(`${bundleBase}/content/${f}`))),
          Promise.all(
            index.behaviour.map((f) => fetchJson<BehaviourFsm>(`${bundleBase}/content/${f}`)),
          ),
          fetchJson<SystemsJson>(`${bundleBase}/design/systems.json`),
          fetchJson<unknown[]>(`${bundleBase}/design/feedback.json`).catch(() => []),
          Promise.all(
            index.files
              .filter((f) => f !== 'index.json')
              .map(
                async (f) =>
                  [
                    f.replace(/\.json$/, ''),
                    await fetchJson<unknown>(`${bundleBase}/content/${f}`),
                  ] as const,
              ),
          ),
        ]);
        if (cancelled) return;
        const first = levels[0] ?? null;
        setLoaded({ levels, behaviours, systems, feedback, content: Object.fromEntries(files) });
        setSelectedId(first?.id ?? null);
        dispatch({ type: 'load', level: first });
      } catch (e) {
        if (!cancelled)
          setLoadError(`no editable content in this version (${(e as Error).message})`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bundleBase]);

  useEffect(() => {
    let cancelled = false;
    import('@gg/templates/check')
      .then((m) => {
        if (!cancelled) setKit(m.checkKit(genre));
      })
      .catch(() => {
        if (!cancelled) setKit(null);
      });
    return () => {
      cancelled = true;
    };
  }, [genre]);

  const entityTypes = useMemo(() => {
    const types = new Set<string>();
    for (const e of kit?.runtime.entityDefs ?? []) if (!e.projectile) types.add(e.type);
    for (const l of loaded?.levels ?? []) for (const e of l.entities) types.add(e.type);
    return [...types];
  }, [kit, loaded]);
  useEffect(() => {
    if (!entityType && entityTypes[0]) setEntityType(entityTypes[0]);
  }, [entityTypes, entityType]);

  // Tiles as large as the panel allows (4 to 16 pixels), so long levels still fit and short ones are easy to hit.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(640);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setAvail(Math.max(320, el.clientWidth - 2)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);
  const cell = draft ? Math.max(4, Math.min(16, Math.floor(avail / draft.width))) : 8;

  // The level painted with the game's art. Painting a whole level takes tens of milliseconds, so it follows the draft a
  // moment behind while tiles are being drawn; tiles changed since the last paint show flat until it catches up.
  const [art, setArt] = useState<LevelArt | null>(null);
  const movementMode = kit?.runtime.movementMode;
  useEffect(() => {
    if (!draft || !look) {
      setArt(null);
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        const pal = artPalette(look.palette, look.outline ?? 'dark');
        const setting = settingFor(genre, movementMode);
        const map = { width: draft.width, height: draft.height, tileSize: draft.tileSize, kindAt: (x: number, y: number) => kindAt(draft, x, y) ?? 'air' };
        const pc = new PixelCanvas(draft.width * draft.tileSize, draft.height * draft.tileSize);
        paintRegion(prepareLevelArt(pal, setting, map, false), pc, 0, 0);
        setArt({ level: draft, pal, setting, image: canvasOf(pc) });
      } catch {
        setArt(null);
      }
    }, 90);
    return () => window.clearTimeout(timer);
  }, [draft, look, genre, movementMode]);
  // First frame of each entity type's sprite (and the player's, and the side-view goal flag), in the game's palette.
  const sprites = useMemo(() => {
    const map = new Map<string, { image: HTMLCanvasElement; anchor: Anchor }>();
    if (!art) return map;
    const add = (key: string, recipe: Recipe | undefined) => {
      const frame = recipe ? paintFrames(recipe, art.pal)[0] : undefined;
      if (recipe && frame) map.set(key, { image: canvasOf(frame.pc), anchor: recipe.anchor });
    };
    for (const t of entityTypes) add(t, RECIPES[TYPE_RECIPES[t] ?? '']);
    const playerW = kit?.runtime.player.w ?? 8;
    add('@player', RECIPES[art.setting === 'side' ? 'hero-side' : art.setting === 'space' ? 'ship' : playerW >= 12 ? 'keeper' : 'hero-topdown']);
    if (art.setting === 'side') add('@goal', FLAG);
    return map;
  }, [art, entityTypes, kit]);

  // Other players' heat on this version, counted per tile (the heatmap's cell is the level's tile size).
  const tileSize = draft?.tileSize ?? null;
  useEffect(() => {
    if (!heatOn || !heatSrc || !tileSize) return;
    let cancelled = false;
    setHeatError(null);
    fetch(`${heatSrc}${heatSrc.includes('?') ? '&' : '?'}cell=${tileSize}`, { cache: 'no-store' })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as Heatmap & { error?: string };
        if (cancelled) return;
        if (res.ok) setHeat(data);
        else setHeatError(data.error ?? 'heatmap unavailable');
      })
      .catch(() => {
        if (!cancelled) setHeatError('heatmap unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [heatOn, heatSrc, tileSize]);
  const levelHeat = heatOn && draft ? (heat?.levels[draft.id] ?? null) : null;
  const total = (cells: HeatCell[] | undefined) => (cells ?? []).reduce((n, c) => n + c.n, 0);

  // Draw the level: tiles by kind, entities as discs, the hovered cell outlined.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !draft) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const W = draft.width * cell;
    const H = draft.height * cell;
    const toCss = (c: readonly [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;
    if (art) {
      // The sky (side and space settings) under the painted level, then the level itself.
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, toCss(art.pal.sky[0]));
      sky.addColorStop(1, toCss(art.pal.sky[1]));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(art.image, 0, 0, art.image.width, art.image.height, 0, 0, W, H);
    } else {
      ctx.fillStyle = COLORS.air;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    for (let y = 0; y < draft.height; y++) {
      for (let x = 0; x < draft.width; x++) {
        const k = kindAt(draft, x, y) ?? 'air';
        // With art, only tiles edited since the last paint are drawn flat.
        if (art && k === (kindAt(art.level, x, y) ?? 'air')) continue;
        if (k === 'air') {
          if (art) {
            ctx.fillStyle = toCss(art.setting === 'side' || art.setting === 'space' ? art.pal.sky[1] : art.pal.floor[2]);
            ctx.fillRect(x * cell, y * cell, cell, cell);
          }
          continue;
        }
        ctx.fillStyle = COLORS[k];
        if (k === 'oneway')
          ctx.fillRect(x * cell, y * cell, cell, Math.max(1, Math.floor(cell / 3)));
        else ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    if (cell >= 8) {
      ctx.strokeStyle = art ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= draft.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cell + 0.5, 0);
        ctx.lineTo(x * cell + 0.5, draft.height * cell);
        ctx.stroke();
      }
      for (let y = 0; y <= draft.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cell + 0.5);
        ctx.lineTo(draft.width * cell, y * cell + 0.5);
        ctx.stroke();
      }
    }
    // Time spent: tiles where position samples fall, brighter where players linger (or get stuck).
    if (levelHeat) {
      const most = Math.max(1, ...levelHeat.sample.map((c) => c.n));
      for (const c of levelHeat.sample) {
        ctx.fillStyle = `rgba(90, 170, 255, ${(0.15 + 0.5 * (c.n / most)).toFixed(3)})`;
        ctx.fillRect(c.x * cell, c.y * cell, cell, cell);
      }
    }
    const scale = cell / draft.tileSize;
    const drawSprite = (key: string, x: number, y: number) => {
      const sp = sprites.get(key);
      if (!sp) return false;
      const w = Math.max(1, Math.round(sp.image.width * scale));
      const h = Math.max(1, Math.round(sp.image.height * scale));
      const left = Math.round(x * cell + cell / 2 - w / 2);
      const top = sp.anchor === 'feet' ? Math.round((y + 1) * cell - h + scale) : Math.round(y * cell + cell / 2 - h / 2);
      ctx.drawImage(sp.image, left, top, w, h);
      return true;
    };
    if (art) {
      if (art.setting === 'side') drawSprite('@goal', draft.goal.x, draft.goal.y);
      drawSprite('@player', draft.spawn.x, draft.spawn.y);
    }
    for (const e of draft.entities) {
      if (art && drawSprite(e.type, e.x, e.y)) continue;
      ctx.fillStyle = colorForType(e.type, entityTypes);
      ctx.beginPath();
      ctx.arc(
        e.x * cell + cell / 2,
        e.y * cell + cell / 2,
        Math.max(2, cell * 0.4),
        0,
        Math.PI * 2,
      );
      ctx.fill();
      if (cell >= 10) {
        ctx.fillStyle = '#0b0b14';
        ctx.font = `${Math.floor(cell * 0.7)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.type[0]!.toUpperCase(), e.x * cell + cell / 2, e.y * cell + cell / 2 + 1);
      }
    }
    // Deaths as red discs (area by count) and quit points as purple crosses, over the entities.
    if (levelHeat) {
      const most = Math.max(1, ...levelHeat.death.map((c) => c.n));
      for (const c of levelHeat.death) {
        ctx.fillStyle = 'rgba(255, 70, 85, 0.8)';
        ctx.beginPath();
        ctx.arc(c.x * cell + cell / 2, c.y * cell + cell / 2, Math.max(2, cell * 0.6 * Math.sqrt(c.n / most)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#c77dff';
      ctx.lineWidth = 2;
      for (const c of levelHeat.quit) {
        const x0 = c.x * cell + 2;
        const y0 = c.y * cell + 2;
        const x1 = (c.x + 1) * cell - 2;
        const y1 = (c.y + 1) * cell - 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.moveTo(x1, y0);
        ctx.lineTo(x0, y1);
        ctx.stroke();
      }
    }
    if (hover) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 1;
      ctx.strokeRect(hover.x * cell + 0.5, hover.y * cell + 0.5, cell - 1, cell - 1);
    }
  }, [draft, cell, hover, entityTypes, levelHeat, art, sprites]);

  const mutate = useCallback(
    (fn: (l: LevelJson) => LevelJson) => dispatch({ type: 'edit', fn }),
    [],
  );

  const applyTool = useCallback(
    (x: number, y: number) => {
      if (!draft || x < 0 || y < 0 || x >= draft.width || y >= draft.height) return;
      switch (tool.kind) {
        case 'tile':
          return mutate((l) => withTile(l, x, y, tool.tile));
        case 'entity':
          return mutate((l) => withEntity(l, x, y, tool.type));
        case 'erase':
          return mutate((l) => withoutEntity(l, x, y));
        case 'spawn':
          return mutate((l) => withMarker(l, 'spawn', x, y));
        case 'goal':
          return mutate((l) => withMarker(l, 'goal', x, y));
        default:
          return;
      }
    },
    [draft, tool, mutate],
  );

  const cellOf = (e: React.PointerEvent<HTMLCanvasElement>) => ({
    x: Math.floor(e.nativeEvent.offsetX / cell),
    y: Math.floor(e.nativeEvent.offsetY / cell),
  });

  const selectLevel = (id: string) => {
    const level = loaded?.levels.find((l) => l.id === id);
    if (!level) return;
    setSelectedId(id);
    dispatch({ type: 'load', level });
  };

  const undo = () => dispatch({ type: 'undo' });

  async function runCheck() {
    if (!draft || !loaded || !kit) return;
    const level = draft;
    setChecking(true);
    // Let the button repaint before the solver runs up to 90 simulated seconds on the main thread.
    await new Promise((r) => setTimeout(r, 0));
    try {
      const { checkLevel } = await import('@gg/templates/check');
      setChecked({
        level,
        result: checkLevel(kit, level, loaded.systems, {
          behaviours: loaded.behaviours,
          content: loaded.content,
          feedback: loaded.feedback as never,
        }),
      });
    } catch (e) {
      setChecked({
        level,
        result: {
          ok: false,
          report: {
            ok: false,
            issues: [{ code: 'check_failed', message: (e as Error).message, severity: 'error' }],
            metrics: {},
          },
          solver: null,
        },
      });
    } finally {
      setChecking(false);
    }
  }

  const apply = () => {
    if (!draft || !check?.ok) return;
    const original = loaded?.levels.find((l) => l.id === draft.id);
    const tiles = original
      ? draft.rows.reduce(
          (n, row, y) => n + [...row].filter((ch, x) => ch !== original.rows[y]?.[x]).length,
          0,
        )
      : 0;
    onApply(
      { levels: [draft] },
      `Level editor: ${draft.id} edited (${tiles} tile(s) changed, ${draft.entities.length} entities, solver ${Math.round((check.solver?.ticks ?? 0) / 60)} s).`,
    );
    dispatch({ type: 'saved' });
  };

  const errors = check?.report.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = check?.report.issues.filter((i) => i.severity === 'warning') ?? [];
  const toolIs = (t: Tool) => JSON.stringify(t) === JSON.stringify(tool);

  return (
    <div className="panel" data-testid="level-editor" data-loaded={loaded ? 'yes' : 'no'}>
      <h2>Level editor</h2>
      {loadError ? <p className="muted">{loadError}</p> : null}
      {!loaded && !loadError ? <p className="muted">Loading levels…</p> : null}
      {loaded && draft ? (
        <>
          <div className="row">
            <label>
              level{' '}
              <select
                value={selectedId ?? ''}
                onChange={(e) => selectLevel(e.target.value)}
                disabled={disabled}
                data-testid="level-select"
              >
                {loaded.levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.id} · {l.name} ({l.width}×{l.height})
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={undo}
              disabled={disabled || history.length === 0}
              data-testid="level-undo"
            >
              undo
            </button>
            <button
              onClick={() => selectedId && selectLevel(selectedId)}
              disabled={disabled || !dirty}
            >
              reset
            </button>
            {heatSrc ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={heatOn}
                  onChange={(e) => setHeatOn(e.target.checked)}
                  data-testid="heat-toggle"
                />{' '}
                player heatmap
              </label>
            ) : null}
          </div>
          <div className="editor-tools" data-testid="editor-tools">
            {KINDS.map((k) => (
              <button
                key={k}
                className={`tool${toolIs({ kind: 'tile', tile: k }) ? ' selected' : ''}`}
                onClick={() => setTool({ kind: 'tile', tile: k })}
                disabled={disabled}
                data-testid={`tool-${k}`}
              >
                <span className="chip" style={{ background: COLORS[k] }} /> {k}
              </button>
            ))}
            <button
              className={`tool${tool.kind === 'spawn' ? ' selected' : ''}`}
              onClick={() => setTool({ kind: 'spawn' })}
              disabled={disabled}
              data-testid="tool-move-spawn"
            >
              move spawn
            </button>
            <button
              className={`tool${tool.kind === 'goal' ? ' selected' : ''}`}
              onClick={() => setTool({ kind: 'goal' })}
              disabled={disabled}
              data-testid="tool-move-goal"
            >
              move goal
            </button>
            <button
              className={`tool${tool.kind === 'entity' ? ' selected' : ''}`}
              onClick={() => setTool({ kind: 'entity', type: entityType })}
              disabled={disabled || !entityType}
              data-testid="tool-entity"
            >
              <span
                className="chip"
                style={{ background: entityType ? colorForType(entityType, entityTypes) : '#333' }}
              />{' '}
              place
            </button>
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setTool({ kind: 'entity', type: e.target.value });
              }}
              disabled={disabled}
              data-testid="entity-type"
              className="entity-type"
            >
              {entityTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              className={`tool${tool.kind === 'erase' ? ' selected' : ''}`}
              onClick={() => setTool({ kind: 'erase' })}
              disabled={disabled}
              data-testid="tool-erase"
            >
              erase entity
            </button>
          </div>
          <div className="editor-scroll" ref={scrollRef}>
            <canvas
              ref={canvasRef}
              width={draft.width * cell}
              height={draft.height * cell}
              className="editor-canvas"
              data-testid="level-canvas"
              data-cell={cell}
              data-spawn={`${draft.spawn.x},${draft.spawn.y}`}
              data-goal={`${draft.goal.x},${draft.goal.y}`}
              data-heat={heat && heatOn ? 'on' : 'off'}
              data-heat-deaths={total(levelHeat?.death)}
              data-heat-quits={total(levelHeat?.quit)}
              data-heat-samples={total(levelHeat?.sample)}
              onPointerDown={(e) => {
                if (disabled) return;
                painting.current = true;
                const c = cellOf(e);
                applyTool(c.x, c.y);
              }}
              onPointerMove={(e) => {
                const c = cellOf(e);
                setHover(c);
                if (painting.current && tool.kind === 'tile') applyTool(c.x, c.y);
              }}
              onPointerUp={() => (painting.current = false)}
              onPointerLeave={() => {
                painting.current = false;
                setHover(null);
              }}
            />
          </div>
          <p className="muted small">
            {draft.width}×{draft.height} tiles · spawn {draft.spawn.x},{draft.spawn.y} · goal{' '}
            {draft.goal.x},{draft.goal.y} · {draft.entities.length} entities
            {hover ? ` · at ${hover.x},${hover.y}: ${kindAt(draft, hover.x, hover.y) ?? '?'}` : ''}
            {dirty ? ' · unsaved changes' : ''}
          </p>
          {heatOn ? (
            <p className="muted small" data-testid="heat-legend">
              {heatError
                ? heatError
                : !heat
                  ? 'Loading the heatmap…'
                  : levelHeat
                    ? `Other players on this version: ${levelHeat.plays} play(s) reached this level · ${total(levelHeat.death)} death(s) (red) · ${total(levelHeat.quit)} left here unfinished (purple) · time spent (blue, brighter where players linger).`
                    : 'No other player has reached this level on this version yet.'}
            </p>
          ) : null}
          <div className="row">
            <button
              onClick={() => void runCheck()}
              disabled={disabled || checking || !kit}
              data-testid="level-check"
            >
              {checking
                ? 'Checking…'
                : kit
                  ? 'Check (validator + solver bot)'
                  : 'Check unavailable'}
            </button>
            <button
              onClick={apply}
              disabled={disabled || !dirty || !check?.ok}
              data-testid="level-apply"
            >
              Apply level
            </button>
          </div>
          {check ? (
            <div className="report" data-testid="level-report" data-ok={check.ok ? 'yes' : 'no'}>
              <p className={check.ok ? 'ok' : 'err'}>
                {check.ok
                  ? `passes: validator ok, ${kit?.solverBot ?? 'solver'} bot finishes in ${Math.round((check.solver?.ticks ?? 0) / 60)} s with ${check.solver?.deaths ?? 0} death(s)`
                  : check.solver
                    ? `the ${kit?.solverBot ?? 'solver'} bot could not finish (${check.solver.deaths} death(s), longest stall ${Math.round(check.solver.stuckMaxTicks / 60)} s)`
                    : 'rejected by the validator'}
              </p>
              <ul className="issues">
                {errors.map((i, n) => (
                  <li key={`e${n}`} className="err">
                    {i.code}: {i.message}
                  </li>
                ))}
                {warnings.map((i, n) => (
                  <li key={`w${n}`} className="muted">
                    warning {i.code}: {i.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
