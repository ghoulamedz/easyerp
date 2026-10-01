import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ThemeProvider } from '../../lib/theme-provider';
import { THEME_BOOTSTRAP_SCRIPT } from '../../lib/theme';
import { directionOf, isLocale, LOCALES, type Locale, translatorFor } from '../../i18n/config';
import '../globals.css';

export function generateStaticParams(): { locale: Locale }[] {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: {
      default: translatorFor(locale)('appName'),
      template: `%s · ${translatorFor(locale)('appName')}`,
    },
    description: translatorFor(locale)('tagline'),
  };
}

/**
 * The document element lives in the dynamic segment, so `lang` and `dir` are
 * decided by the locale on the server rather than patched afterwards. Arabic is
 * right-to-left in the very first byte the browser receives.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} dir={directionOf(locale)} suppressHydrationWarning>
      <body className="antialiased">
        {/* Sets the theme class before the first paint. Without it a dark-mode
            user gets a white flash on every navigation. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
