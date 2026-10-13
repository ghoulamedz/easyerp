import type { NextConfig } from 'next';

/**
 * In production Caddy sends `/api/*` to the API. In development and in the e2e
 * run there is no Caddy, so Next does the same job: both halves of the browser
 * then talk to one origin, which removes CORS from the picture entirely instead
 * of configuring it twice.
 *
 * The fallback is the local API's own default (API_PORT in apps/api/.env), so
 * `pnpm dev` needs no environment at all. A deployment sets API_INTERNAL_URL
 * explicitly — `http://127.0.0.1:3002` for systemd on one host — and never sees
 * this value.
 */
const apiTarget = process.env.API_INTERNAL_URL ?? 'http://localhost:3002';

const config: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Deliberately not `output: 'standalone'`. Standalone exists to copy a minimal
  // server and its traced dependencies into a container image, and there are no
  // container images any more (ADR 0013). It also makes `next start` — which is
  // what the systemd unit runs — unsupported, so Next warns on every boot.
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
