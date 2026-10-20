import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { isLocale, type Locale } from '@/i18n/config';
import { readSession, readSetupStatusSafe } from '../../../lib/server-api';

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
  // If the API is unreachable we assume a fresh deployment → /setup (so the
  // operator lands where the DB error is shown, not behind a sign-in wall).
  // Both answers are needed on the common path, and awaiting them in sequence cost a
  // round trip on every page load. They are independent reads of two endpoints, so
  // they go at once; the redirects below still evaluate them in the same order, and a
  // fresh deployment simply spends one harmless call on `/auth/get-session`.
  const [status, session] = await Promise.all([readSetupStatusSafe(), readSession()]);
  if (status.needsSetup) redirect(`/${typedLocale}/setup`);
  if (!session) redirect(`/${typedLocale}/sign-in`);

  return <AppShell locale={typedLocale}>{children}</AppShell>;
}
