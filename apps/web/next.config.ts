import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@gg/schemas', '@gg/db', '@gg/catalog', '@gg/sdk', '@gg/validators', '@gg/template-core', '@gg/templates', '@gg/template-platformer', '@gg/template-survivors', '@gg/template-topdown-action', '@gg/template-shmup', '@gg/template-metroidvania', '@gg/template-puzzle', '@gg/template-lifesim', '@gg/template-freeform'],
  serverExternalPackages: ['@supabase/supabase-js'],
  // The shared packages are TypeScript ESM with '.js' import specifiers (what tsc, tsx and vite expect). Webpack maps
  // them to the '.ts' sources; Turbopack does not support this option, so dev and build run with --webpack.
  experimental: { extensionAlias: { '.js': ['.ts', '.tsx', '.js'] } },
  async headers() {
    return [
      {
        // Bundles are static and immutable per version; the iframe sandbox is what isolates them.
        source: '/bundles/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
