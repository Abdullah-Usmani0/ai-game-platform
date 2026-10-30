import { z } from 'zod';
import { Id } from './common';

/** How a crop looks as it grows: the plant's build, and the colour of what it bears. */
export const CropLook = z.object({
  /** root: a swelling bulb under leaves; leafy: a head of leaves; tall: a stalk with cobs; bush: fruit on a shrub. */
  shape: z.enum(['root', 'leafy', 'tall', 'bush']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a #rrggbb colour'),
});
export type CropLook = z.infer<typeof CropLook>;

/** One crop a farm can grow: what its seeds cost, what it sells for, how many watered nights it takes to ripen. */
export const Crop = z.object({
  id: Id,
  name: z.string().min(1).max(16),
  seedPrice: z.int().min(1).max(500),
  sellPrice: z.int().min(1).max(2000),
  growDays: z.int().min(1).max(14),
  /** Watered nights until it bears again after a harvest; without it the plant is gone once harvested. */
  regrowDays: z.int().min(1).max(14).optional(),
  look: CropLook,
});
export type Crop = z.infer<typeof Crop>;

/** content/crops.json: the crops a farm grows, in the order the shop offers them (it shows the first four). */
export const CropTable = z
  .object({
    version: z.literal(1),
    crops: z.array(Crop).min(1).max(8),
  })
  .refine((t) => new Set(t.crops.map((c) => c.id)).size === t.crops.length, { message: 'crop ids must be unique', path: ['crops'] });
export type CropTable = z.infer<typeof CropTable>;
