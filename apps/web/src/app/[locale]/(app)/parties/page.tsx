import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { PartiesList } from '@/components/parties-list';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translatorFor(locale);
  return { title: t('partiesTitle') };
}

export default async function PartiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('partiesTitle')} description={t('partiesDescription')} />
      <PartiesList locale={typedLocale} />
    </div>
  );
}
