import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { DocumentList } from '@/components/document-list';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translatorFor(locale);
  return { title: t('deliveryNotesTitle') };
}

export default async function DeliveryNotesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('deliveryNotesTitle')} description={t('deliveryNotesDescription')} />
      <DocumentList
        locale={typedLocale}
        endpoint="/sales/delivery-notes"
        createPermission="delivery-note:create"
        newHref={`/${typedLocale}/delivery-notes/new`}
        newKey="newDeliveryNote"
        addFirstKey="addFirstDeliveryNote"
        emptyKey="noDeliveryNotes"
        issuePermission="delivery-note:issue"
      />
    </div>
  );
}