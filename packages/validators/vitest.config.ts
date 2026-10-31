import { defineConfig } from 'vitest/config';
// Art QA paints every shipped sprite and rig frame in several palettes and modes: more than 5 s on a busy machine.
export default defineConfig({ test: { include: ['src/**/*.test.ts'], testTimeout: 60000 } });
