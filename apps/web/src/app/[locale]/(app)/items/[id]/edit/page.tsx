import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { ItemEditForm } from '@/components/item-edit-form';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('editItem') : 'Edit item' };
}

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('editItem')} description={t('itemsDescription')} />
      <ItemEditForm locale={typedLocale} id={id} />
    </div>
  );
}