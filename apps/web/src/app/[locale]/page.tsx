import { redirect } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import { readSetupStatus } from '../../lib/server-api';

/**
 * The landing page.
 *
 * A fresh deployment has no Business and nothing to sign in to (ADR 0012,
 * spec 001 story 1), so the first visit is routed to Setup while
 * `GET /api/setup/status` answers `needsSetup`. Otherwise the dashboard owns
 * the visit — and its layout sends anyone without a session to sign-in.
 *
 * If the API is temporarily unreachable (e.g. during dev startup where the
 * web app may boot before the API), we retry a few times before deciding.
 * This avoids incorrectly redirecting to sign-in when the database is empty
 * but the API hasn't finished booting yet.
 */
async function readSetupStatusWithRetry(): Promise<{ needsSetup: boolean } | null> {
  // In development, the API might not be ready when the web app first receives
  // a request. Retry a few times with a short delay.
  const maxRetries = 3;
  const baseDelayMs = 200;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const status = await readSetupStatus();
    if (status !== null) {
      return status;
    }
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
  return null;
}

export default async function LocaleRoot({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) redirect('/fr');

  const status = await readSetupStatusWithRetry();
  // An unreachable API must not route a live Business back through first-run
  // Setup: with no answer the dashboard is the safe landing — its session gate
  // funnels strangers to sign-in — matching setup/page.tsx.
  if (status?.needsSetup) {
    redirect(`/${locale}/setup`);
  }

  redirect(`/${locale}/dashboard`);
}