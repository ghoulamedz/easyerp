import type { Metadata } from 'next';
import { SignInScreen } from '../../../components/sign-in-screen';
import { isLocale, translatorFor, type Locale } from '../../../i18n/config';

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
  return <SignInScreen locale={typedLocale} />;
}
