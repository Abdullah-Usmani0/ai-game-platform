/**
 * Vite config factory for a generated game bundle.
 * `phaser` and `@gg/sdk` are externals resolved to the shared engine chunk
 * (window.Phaser / window.GG) so every game shares one cached engine file.
 * @param {{ root: string, entry: string, outDir?: string }} opts
 */
export function gameViteConfig(opts) {
  const { root, entry, outDir = 'dist' } = opts;
  return {
    root,
    base: './',
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2022',
      minify: true,
      sourcemap: false,
      lib: { entry, name: 'GGGame', formats: ['iife'], fileName: () => 'game.js' },
      rollupOptions: {
        external: ['phaser', '@gg/sdk'],
        output: { globals: { phaser: 'Phaser', '@gg/sdk': 'GG' }, inlineDynamicImports: true },
      },
    },
  };
}
export default gameViteConfig;
