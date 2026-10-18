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
 * If the API is unreachable we assume a fresh deployment and route to Setup
 * (per product requirement: "redirection to /setup should happen even if
 * there is no db connection — we assume it's first setup"). Setup itself
 * will surface the DB error so the operator sees why the form cannot submit.
 */
async function readSetupStatusWithRetry(): Promise<{ needsSetup: boolean } | null> {
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
  // Null = API unreachable → treat as fresh deployment (needsSetup) so the
  // visitor lands on /setup where the DB error is shown, not on /sign-in
  // where there is nobody to sign in as.
  if (status === null || status.needsSetup) {
    redirect(`/${locale}/setup`);
  }

  redirect(`/${locale}/dashboard`);
}