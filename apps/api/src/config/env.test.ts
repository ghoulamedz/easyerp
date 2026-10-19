/**
 * `loadEnv` is the only reader of `process.env`, and every rule in it is a
 * deployment hazard that must fail at boot rather than at the first request.
 * Each case here is a configuration that shipped, or nearly shipped.
 */

import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

/** The minimum a process needs to parse at all. */
const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@db.example:5432/easyerp?schema=public',
  BETTER_AUTH_SECRET: 'a-secret-long-enough-to-pass-the-minimum-length-check',
  BETTER_AUTH_URL: 'https://easyerp-web.vercel.app',
  CORS_ORIGINS: 'https://easyerp-web.vercel.app',
  FIRST_SETUP_TOKEN: 'a-real-setup-token',
} as const;

describe('loadEnv', () => {
  it('parses the web origin and marks production', () => {
    const env = loadEnv({ ...base });
    expect(env.BETTER_AUTH_URL).toBe('https://easyerp-web.vercel.app');
    expect(env.CORS_ORIGINS).toEqual(['https://easyerp-web.vercel.app']);
    expect(env.isProduction).toBe(true);
  });

  it('splits and trims a comma-separated CORS_ORIGINS', () => {
    const env = loadEnv({
      ...base,
      CORS_ORIGINS: 'https://easyerp-web.vercel.app , https://easyerp.example.tn',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://easyerp-web.vercel.app', 'https://easyerp.example.tn']);
  });

  it('refuses a wildcard origin, because a wildcard plus credentials is an open door', () => {
    expect(() => loadEnv({ ...base, CORS_ORIGINS: 'https://*.vercel.app' })).toThrow(
      /never a wildcard/,
    );
  });

  it('refuses the development setup token in production', () => {
    expect(() => loadEnv({ ...base, FIRST_SETUP_TOKEN: 'dev-first-setup-token' })).toThrow(
      /non-default value in production/,
    );
  });

  it('refuses a reserved placeholder origin in production', () => {
    // The demo workflow used to boot on `https://placeholder.invalid` and correct
    // it in a later step. A deployment that kept the placeholder answered 403
    // INVALID_ORIGIN at sign-in for every origin, which reads as a CORS bug and is
    // not one. Refusing to parse turns that into a failed deploy.
    expect(() => loadEnv({ ...base, CORS_ORIGINS: 'https://placeholder.invalid' })).toThrow(
      /reserved host/,
    );
    expect(() => loadEnv({ ...base, BETTER_AUTH_URL: 'https://placeholder.invalid' })).toThrow(
      /reserved host/,
    );
  });

  it('accepts a reserved origin outside production, so local runs need no invention', () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: 'test',
      CORS_ORIGINS: 'http://localhost:3100',
      BETTER_AUTH_URL: 'http://localhost:3100',
      FIRST_SETUP_TOKEN: 'dev-first-setup-token',
    });
    expect(env.isProduction).toBe(false);
  });

  it.each([
    ['a domain that merely contains "test"', 'https://latest-invoice.tn'],
    ['a real Vercel deployment hostname', 'https://easyerp-web-abc123-team.vercel.app'],
    ['a custom domain', 'https://erp.almedz.dev'],
  ])('does not mistake %s for a placeholder', (_label, origin) => {
    expect(() => loadEnv({ ...base, CORS_ORIGINS: origin })).not.toThrow();
  });
});
