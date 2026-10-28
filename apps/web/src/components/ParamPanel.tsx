'use client';

import { useEffect, useState } from 'react';

export interface PanelItem {
  systemId: string;
  param: string;
  label: string;
  min: number;
  max: number;
  step: number;
  affects: 'levels' | 'assets' | 'none';
  value: number;
}

/** Tunable parameters of the selected systems. Applying sends a parameter edit (no model call) and re-runs the gates. */
export function ParamPanel({ panels, disabled, onApply }: { panels: PanelItem[]; disabled: boolean; onApply: (message: string) => void }) {
  const [values, setValues] = useState<Record<string, number>>({});
  useEffect(() => {
    setValues(Object.fromEntries(panels.map((p) => [`${p.systemId}.${p.param}`, p.value])));
  }, [panels]);
  const changed = panels.filter((p) => values[`${p.systemId}.${p.param}`] !== undefined && values[`${p.systemId}.${p.param}`] !== p.value);
  const message = changed.map((p) => `set ${p.systemId}.${p.param}=${values[`${p.systemId}.${p.param}`]}`).join(' ');
  if (panels.length === 0) return null;
  return (
    <div className="panel" data-testid="param-panel">
      <h2>Tuning</h2>
      <div className="params">
        {panels.map((p) => {
          const key = `${p.systemId}.${p.param}`;
          const v = values[key] ?? p.value;
          return (
            <label key={key} className="param">
              <span>
                {p.label} <span className="muted">({p.systemId})</span>
              </span>
              <input type="range" min={p.min} max={p.max} step={p.step} value={v} disabled={disabled} onChange={(e) => setValues((s) => ({ ...s, [key]: Number(e.target.value) }))} />
              <output>{v}</output>
              {p.affects === 'levels' ? <span className="muted tag">re-validates levels</span> : null}
            </label>
          );
        })}
      </div>
      <div className="row">
        <button disabled={disabled || changed.length === 0} onClick={() => onApply(message)} data-testid="apply-params">
          Apply {changed.length ? `(${changed.length})` : ''}
        </button>
        {changed.length ? <code className="muted">{message}</code> : null}
      </div>
    </div>
  );
}
