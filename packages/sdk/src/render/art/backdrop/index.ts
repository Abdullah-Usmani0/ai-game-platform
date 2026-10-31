import { parseHex, type RGB } from '../color.js';
import type { PaletteRoles } from '../palette.js';
import type { PixelCanvas } from '../pixels.js';
import * as coral from './coral.js';
import * as frost from './frost.js';
import * as gothic from './gothic.js';

export type Layer = 'far' | 'mid' | 'near';

/** A procedural backdrop theme: the palette roles a game in it has, the colours it paints with, and its layers. */
export interface Theme {
  id: string;
  roles: PaletteRoles;
  palette: readonly RGB[];
  layers: Record<Layer, (w: number, h: number, seed: number) => PixelCanvas>;
  floor: (w: number, h: number, top: number, seed: number) => PixelCanvas;
}

/** The painter's themes: a moonlit gothic ruin, a sunlit coral reef, a frozen clockwork city at night. */
export const THEMES: Readonly<Record<string, Theme>> = {
  gothic: { id: 'gothic', roles: gothic.ROLES, palette: gothic.PALETTE, layers: { far: gothic.gothicFar, mid: gothic.gothicMid, near: gothic.gothicNear }, floor: gothic.gothicFloor },
  coral: { id: 'coral', roles: coral.ROLES, palette: coral.PALETTE, layers: { far: coral.coralFar, mid: coral.coralMid, near: coral.coralNear }, floor: coral.coralFloor },
  frost: { id: 'frost', roles: frost.ROLES, palette: frost.PALETTE, layers: { far: frost.frostFar, mid: frost.frostMid, near: frost.frostNear }, floor: frost.frostFloor },
};

/** The theme whose palette roles are nearest a game's: the painter it draws its backdrop with until it has its own. */
export function themeFor(roles: PaletteRoles): Theme {
  const keys = ['background', 'mid', 'foreground', 'accent', 'danger', 'ui'] as const;
  const far = (t: Theme) => keys.reduce((sum, k) => {
    const a = parseHex(roles[k]);
    const b = parseHex(t.roles[k]);
    return sum + Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  }, 0);
  return Object.values(THEMES).reduce((best, t) => (far(t) < far(best) ? t : best));
}
