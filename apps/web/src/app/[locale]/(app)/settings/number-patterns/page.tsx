import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { NumberPatternsList } from '@/components/number-patterns-list';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translatorFor(locale);
  return { title: t('numberPatternsTitle') };
}

export default async function NumberPatternsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('numberPatternsTitle')} description={t('numberPatternsDescription')} />
      <NumberPatternsList locale={typedLocale} />
    </div>
  );
}