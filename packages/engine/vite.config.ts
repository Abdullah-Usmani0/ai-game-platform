import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    sourcemap: false,
    lib: { entry: 'src/entry.ts', name: 'GGEngine', formats: ['iife'], fileName: () => 'engine.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
