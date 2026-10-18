import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SetupScreen } from '@/components/setup-screen';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';
import { readSession, readSetupStatusSafe } from '../../../lib/server-api';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('setupTitle') : 'Setup' };
}

/**
 * First-run Setup (ADR 0012).
 *
 * Reached only while no Business exists: a restored backup or a finished Setup
 * sends the visitor to the dashboard (whose gate sends strangers to sign-in),
 * so this path can never re-provision a live Business — not even by hand.
 *
 * If the API is unreachable we stay on Setup (per product requirement: assume
 * a fresh DB) and surface the DB error so the operator sees why the form cannot
 * submit instead of being bounced to /sign-in where there is nobody to sign in as.
 */
async function readSetupStatusWithRetry(): Promise<
  { needsSetup: boolean; unreachable: boolean; error?: string } | null
> {
  const maxRetries = 3;
  const baseDelayMs = 200;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const status = await readSetupStatusSafe();
    // Null never happens with the safe variant; keep the shape for the retry loop.
    if (status !== null) {
      // If the API answered (unreachable:false) we trust it; if it never answered
      // we also return needsSetup:true with the error so the page can render.
      return status as { needsSetup: boolean; unreachable: boolean; error?: string };
    }
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
    }
  }
  return null;
}

export default async function SetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = isLocale(locale) ? locale : 'fr';

  const [status, session] = await Promise.all([readSetupStatusWithRetry(), readSession()]);
  // Unreachable API is treated as "fresh deployment" — stay on Setup and show the error.
  const dbError = status && 'error' in status && status.error ? (status.error as string) : null;
  const unreachable = Boolean(status && 'unreachable' in status && status.unreachable);
  if (status && !status.needsSetup && !unreachable) {
    redirect(session ? `/${typedLocale}/dashboard` : `/${typedLocale}/sign-in`);
  }
  // status === null cannot happen with the safe helper; fall through to Setup.

  return <SetupScreen locale={typedLocale} dbError={dbError} />;
}