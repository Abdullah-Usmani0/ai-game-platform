import type { PaletteRoles, PixelCanvas, RGB } from '@gg/sdk/art';
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
