import type { Metadata } from 'next';
import { PageHeader } from '../../../../../components/ui';
import { ItemForm } from '../../../../../components/item-form';
import { isLocale, translatorFor, type Locale } from '../../../../../i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('newItem') : 'New item' };
}

export default async function NewItemPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('newItem')} description={t('itemsDescription')} />
      <ItemForm locale={typedLocale} />
    </div>
  );
}
