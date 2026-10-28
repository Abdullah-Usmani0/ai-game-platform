import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@gg/schemas', '@gg/db'],
  serverExternalPackages: ['@supabase/supabase-js'],
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
