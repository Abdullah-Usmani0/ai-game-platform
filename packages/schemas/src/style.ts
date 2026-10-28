import { z } from 'zod';

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const StyleCard = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(80),
  family: z.enum(['8bit', '16bit', 'hd-pixel', 'painted', 'hd2d']),
  canvas: z.object({ w: z.int().min(160).max(1920), h: z.int().min(90).max(1080) }),
  scale: z.enum(['integer']).default('integer'),
  pixelArt: z.boolean(),
  palette: z.object({
    background: Hex,
    mid: Hex,
    foreground: Hex,
    accent: Hex,
    danger: Hex,
    ui: Hex,
    extra: z.array(Hex).max(10).default([]),
  }),
  outline: z.enum(['none', 'dark', 'colored', 'selective']),
  animationFps: z.object({ character: z.int().min(4).max(30), effects: z.int().min(8).max(60) }),
  camera: z.object({
    follow: z.enum(['lerp', 'deadzone', 'room']),
    lerp: z.number().min(0.01).max(1),
    deadzone: z.object({ w: z.int().min(0), h: z.int().min(0) }),
    maxShake: z.number().min(0).max(1),
    zoom: z.number().min(1).max(8),
  }),
  typography: z.object({ font: z.enum(['press-start-2p', 'pixelify-sans', 'm5x7', 'system']), size: z.int().min(6).max(32) }),
  audioMood: z.array(z.string().max(32)).max(6),
  postFx: z.object({ vignette: z.boolean(), bloom: z.boolean(), crt: z.boolean() }),
  references: z.array(z.object({ note: z.string().max(200) })).max(6).default([]),
  negative: z.array(z.string().max(64)).max(20).default([]),
});
export type StyleCard = z.infer<typeof StyleCard>;
