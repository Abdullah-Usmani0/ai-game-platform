'use client';

import { useEffect, useState } from 'react';

export interface StyleLike {
  palette: Record<string, string | string[]>;
  outline: string;
  camera: { lerp: number; maxShake: number; zoom: number };
  typography: { font: string; size: number };
  postFx: { vignette: boolean; bloom: boolean; crt: boolean };
}

const ROLES = ['background', 'mid', 'foreground', 'accent', 'danger', 'ui'] as const;
const OUTLINES = ['none', 'dark', 'colored', 'selective'];
const FONTS = ['press-start-2p', 'pixelify-sans', 'm5x7', 'system'];

type Patch = Record<string, string | number | boolean>;

/** Form editor over the style card. Applying sends a style edit: only assets whose prompt changed regenerate (phase 2), then the gates run. */
export function StyleEditor({ style, disabled, onApply }: { style: StyleLike; disabled: boolean; onApply: (message: string) => void }) {
  const [patch, setPatch] = useState<Patch>({});
  useEffect(() => setPatch({}), [style]);
  const current = (key: string, fallback: string | number | boolean) => (key in patch ? patch[key]! : fallback);
  const set = (key: string, value: string | number | boolean) => setPatch((p) => ({ ...p, [key]: value }));
  const entries = Object.entries(patch);
  const message = entries.map(([k, v]) => `set ${k}=${typeof v === 'string' && !/^#[0-9a-fA-F]{6}$/.test(v) ? `"${v}"` : String(v)}`).join(' ');
  return (
    <div className="panel" data-testid="style-editor">
      <h2>Style card</h2>
      <div className="swatches">
        {ROLES.map((role) => (
          <label key={role} className="swatch">
            <input type="color" value={String(current(`palette.${role}`, String(style.palette[role] ?? '#000000')))} disabled={disabled} onChange={(e) => set(`palette.${role}`, e.target.value)} />
            <span className="muted">{role}</span>
          </label>
        ))}
      </div>
      <div className="row">
        <label>
          outline{' '}
          <select value={String(current('outline', style.outline))} disabled={disabled} onChange={(e) => set('outline', e.target.value)}>
            {OUTLINES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label>
          font{' '}
          <select value={String(current('typography.font', style.typography.font))} disabled={disabled} onChange={(e) => set('typography.font', e.target.value)}>
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="param">
        <span>camera shake</span>
        <input type="range" min={0} max={1} step={0.05} value={Number(current('camera.maxShake', style.camera.maxShake))} disabled={disabled} onChange={(e) => set('camera.maxShake', Number(e.target.value))} />
        <output>{Number(current('camera.maxShake', style.camera.maxShake))}</output>
      </label>
      <label className="param">
        <span>camera lerp</span>
        <input type="range" min={0.01} max={1} step={0.01} value={Number(current('camera.lerp', style.camera.lerp))} disabled={disabled} onChange={(e) => set('camera.lerp', Number(e.target.value))} />
        <output>{Number(current('camera.lerp', style.camera.lerp))}</output>
      </label>
      <div className="row">
        {(['vignette', 'bloom', 'crt'] as const).map((fx) => (
          <label key={fx} className="check">
            <input type="checkbox" checked={Boolean(current(`postFx.${fx}`, style.postFx[fx]))} disabled={disabled} onChange={(e) => set(`postFx.${fx}`, e.target.checked)} /> {fx}
          </label>
        ))}
      </div>
      <div className="row">
        <button disabled={disabled || entries.length === 0} onClick={() => onApply(message)} data-testid="apply-style">
          Apply {entries.length ? `(${entries.length})` : ''}
        </button>
        {entries.length ? <code className="muted">{message}</code> : null}
      </div>
    </div>
  );
}
