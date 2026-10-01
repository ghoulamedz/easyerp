import type { NextConfig } from 'next';

/**
 * In production Caddy sends `/api/*` to the API container. In development there
 * is no Caddy, so Next does the same job: both halves of the browser then talk
 * to one origin, which removes CORS from the picture entirely instead of
 * configuring it twice.
 */
const apiTarget = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const config: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiTarget}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default config;
