import { notFound } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { isLocale, type Locale } from '../../../i18n/config';

/**
 * The application frame, shared by every signed-in page.
 *
 * The locale segment decides the language and the writing direction; everything
 * inside is the same shell.
 */
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typedLocale: Locale = locale;

  return <AppShell locale={typedLocale}>{children}</AppShell>;
}
