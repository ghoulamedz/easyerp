import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SetupScreen } from '@/components/setup-screen';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';
import { readSession, readSetupStatus } from '../../../lib/server-api';

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

export default async function SetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = isLocale(locale) ? locale : 'fr';

  const [status, session] = await Promise.all([readSetupStatusWithRetry(), readSession()]);
  // If the API is unreachable after retries, we cannot determine if setup is needed.
  // Redirect to dashboard/sign-in to avoid an infinite loop on the setup page.
  if (status === null) {
    redirect(session ? `/${typedLocale}/dashboard` : `/${typedLocale}/sign-in`);
  }
  if (!status.needsSetup) {
    redirect(session ? `/${typedLocale}/dashboard` : `/${typedLocale}/sign-in`);
  }

  return <SetupScreen locale={typedLocale} />;
}