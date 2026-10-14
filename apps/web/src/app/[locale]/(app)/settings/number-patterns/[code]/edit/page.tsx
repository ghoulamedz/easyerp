import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { NumberPatternEditForm } from '@/components/number-pattern-edit-form';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('editNumberPattern') : 'Edit number pattern' };
}

export default async function EditNumberPatternPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('editNumberPattern')} description={t('numberPatternsDescription')} />
      <NumberPatternEditForm locale={typedLocale} code={code} />
    </div>
  );
}