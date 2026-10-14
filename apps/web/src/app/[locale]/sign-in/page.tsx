import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInScreen } from '@/components/sign-in-screen';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';
import { readSession, readSetupStatus } from '../../../lib/server-api';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('signInTitle') : 'Sign in' };
}

export default async function SignInPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = isLocale(locale) ? locale : 'fr';

  // Before Setup there is nobody to sign in as: send the visitor to Setup.
  const status = await readSetupStatus();
  if (status?.needsSetup) redirect(`/${typedLocale}/setup`);

  // A signed-in visitor has no business on this screen.
  if (await readSession()) redirect(`/${typedLocale}/dashboard`);

  return <SignInScreen locale={typedLocale} />;
}
