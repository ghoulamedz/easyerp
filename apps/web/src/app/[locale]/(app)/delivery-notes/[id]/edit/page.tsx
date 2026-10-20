import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { DeliveryNoteUnifiedForm } from '@/components/delivery-note-unified';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('editDeliveryNote') : 'Edit delivery note' };
}

export default async function EditDeliveryNotePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('editDeliveryNote')} description={t('deliveryNotesDescription')} />
      <DeliveryNoteUnifiedForm locale={typedLocale} id={id} />
    </div>
  );
}
