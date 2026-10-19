import { describe, expect, it } from 'vitest';
import { trustedOrigins } from './trusted-origins.js';

describe('trustedOrigins', () => {
  it('keeps the configured origins when Vercel exposes no hostname', () => {
    // Local development and the integration suite: no VERCEL_* variables, so the
    // configured list is the whole list.
    expect(trustedOrigins({ corsOrigins: ['http://localhost:3003'] })).toEqual([
      'http://localhost:3003',
    ]);
  });

  it('unions the deployment hostname and the stable production domain with CORS_ORIGINS', () => {
    // The 403 this test exists for: the visitor's Origin is the stable production
    // domain, while CORS_ORIGINS was pinned to a per-deployment hostname from
    // `vercel ls`, so it was absent from trustedOrigins and Better Auth answered
    // 403 INVALID_ORIGIN.
    expect(
      trustedOrigins({
        corsOrigins: ['https://easyerp-web-abc123-team.vercel.app'],
        vercelUrl: 'easyerp-web-abc123-team.vercel.app',
        vercelProjectProductionUrl: 'easyerp-demo.vercel.app',
      }),
    ).toEqual(['https://easyerp-web-abc123-team.vercel.app', 'https://easyerp-demo.vercel.app']);
  });

  it('treats an already-schemed Vercel hostname as an origin instead of prefixing it twice', () => {
    expect(trustedOrigins({ corsOrigins: [], vercelUrl: 'https://preview.vercel.app' })).toEqual([
      'https://preview.vercel.app',
    ]);
  });

  it('normalizes away a trailing slash so the list and the Origin header agree', () => {
    expect(trustedOrigins({ corsOrigins: ['https://easyerp.example.com/'] })).toEqual([
      'https://easyerp.example.com',
    ]);
  });

  it('drops wildcards, malformed entries and empty values instead of widening the door', () => {
    expect(
      trustedOrigins({
        corsOrigins: ['*', 'https://*.vercel.app', '  ', 'not a url'],
        vercelUrl: '   ',
        vercelProjectProductionUrl: undefined,
      }),
    ).toEqual([]);
  });

  it('deduplicates an origin that appears twice', () => {
    expect(
      trustedOrigins({
        corsOrigins: ['https://easyerp-demo.vercel.app'],
        vercelProjectProductionUrl: 'easyerp-demo.vercel.app',
      }),
    ).toEqual(['https://easyerp-demo.vercel.app']);
  });
});
