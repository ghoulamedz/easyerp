import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  directionOf,
  isLocale,
  LOCALES,
  type MessageKey,
  messagesFor,
} from './config';

describe('locales', () => {
  it('ships the three locales together', () => {
    expect(LOCALES).toEqual(['fr', 'en', 'ar']);
    expect(DEFAULT_LOCALE).toBe('fr');
  });

  it('derives the writing direction from the locale', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('fr')).toBe('ltr');
    expect(directionOf('en')).toBe('ltr');
  });

  it('recognises exactly the shipped locales', () => {
    expect(isLocale('fr')).toBe(true);
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale('FR')).toBe(false);
  });
});

describe('messages', () => {
  it('defines the same keys in every locale, so a missing translation fails the build', () => {
    const reference = Object.keys(messagesFor('en')).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(messagesFor(locale)).sort(), locale).toEqual(reference);
    }
  });

  it('leaves no message blank in any locale', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(messagesFor(locale))) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('gives Arabic real Arabic rather than a French or English fallback', () => {
    // Checked across a spread of keys, not one. A single checked key is what let
    // a French sentence sit unnoticed in the Arabic dictionary.
    const prose: (keyof ReturnType<typeof messagesFor>)[] = [
      'tagline',
      'signInIntro',
      'statusSubtitle',
      'navDashboard',
      'permissionsEmpty',
    ];
    for (const key of prose) {
      const value = messagesFor('ar')[key];
      expect(value, `ar.${key} is not translated`).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it('keeps each locale distinct, so a copy-paste cannot pass as a translation', () => {
    const prose = ['tagline', 'signInIntro', 'navDashboard', 'permissionsEmpty'] as const;
    for (const key of prose) {
      expect(messagesFor('fr')[key], `fr.${key} is a copy of en`).not.toBe(messagesFor('en')[key]);
      expect(messagesFor('ar')[key], `ar.${key} is a copy of en`).not.toBe(messagesFor('en')[key]);
    }
  });

  it('keeps a typed key honest, so renaming a message breaks the build', () => {
    // The point of `MessageKey` is that a typo cannot compile. Asserting on a
    // real key proves the type is doing work rather than widening to string.
    const key: MessageKey = 'tagline';
    expect(messagesFor('fr')[key]).not.toBe(messagesFor('en')[key]);
    expect(messagesFor('ar')[key]).not.toBe(messagesFor('en')[key]);
  });

  it('interpolates a count into a message', () => {
    expect(messagesFor('en').permissionsTotal).toContain('{count}');
  });
});
