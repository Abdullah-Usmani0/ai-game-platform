import { z } from 'zod';
import { Genre } from './common.js';

export const BundleManifest = z.object({
  schema: z.literal(1),
  gameId: z.string(),
  versionId: z.string(),
  number: z.int().nonnegative(),
  engine: z.object({ phaser: z.string(), sdk: z.string(), url: z.string() }),
  entry: z.literal('game.js'),
  genre: Genre,
  canvas: z.object({ w: z.int(), h: z.int(), scale: z.literal('integer') }),
  inputs: z.array(z.enum(['keyboard', 'touch', 'gamepad'])),
  capabilities: z.object({ saves: z.boolean(), multiplayer: z.boolean(), testSeam: z.literal(true) }),
  assets: z.array(z.object({ key: z.string(), path: z.string(), bytes: z.int().nonnegative(), sha256: z.string() })),
  contentHash: z.string(),
  lineage: z.array(z.object({ gameId: z.string(), versionId: z.string(), ownerHandle: z.string() })),
  license: z.literal('gg-remix-1.0'),
  aiDisclosure: z.object({ preGenerated: z.array(z.string()), liveGenerated: z.array(z.string()) }),
  builtAt: z.string(),
});
export type BundleManifest = z.infer<typeof BundleManifest>;
