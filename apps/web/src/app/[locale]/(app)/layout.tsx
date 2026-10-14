import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { isLocale, type Locale } from '@/i18n/config';
import { readSession, readSetupStatus } from '../../../lib/server-api';

/**
 * The application frame, shared by every signed-in page.
 *
 * The session gate lives here and nowhere else (ADR 0015): the layout asks
 * `GET /api/auth/get-session` with the request's cookie and sends anyone
 * without a session to sign-in. It answers exactly one question — is anyone
 * signed in — and deliberately nothing more. Whether the account may act is
 * `SessionGuard`'s answer on every API request, which is what makes a disabled
 * account stop working on its next request rather than on its next page load.
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
  // No Business yet: every app URL funnels to first-run Setup, even sign-in —
  // there is nobody to sign in as until Setup creates the Administrator.
  const status = await readSetupStatus();
  if (status?.needsSetup) redirect(`/${typedLocale}/setup`);

  const session = await readSession();
  if (!session) redirect(`/${typedLocale}/sign-in`);

  return <AppShell locale={typedLocale}>{children}</AppShell>;
}
