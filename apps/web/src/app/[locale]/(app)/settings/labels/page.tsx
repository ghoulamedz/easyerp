import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { LabelsList } from '@/components/labels-list';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translatorFor(locale);
  return { title: t('labelsTitle') };
}

export default async function LabelsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('labelsTitle')} description={t('labelsDescription')} />
      <LabelsList locale={typedLocale} />
    </div>
  );
}