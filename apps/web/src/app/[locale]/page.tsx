import { redirect } from 'next/navigation';
import { isLocale } from '../../i18n/config';

/** The landing page is the dashboard; there is nothing to show before it. */
export default async function LocaleRoot({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) redirect('/fr');
  redirect(`/${locale}/dashboard`);
}
