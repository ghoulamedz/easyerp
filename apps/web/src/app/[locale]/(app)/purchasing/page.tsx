import type { Metadata } from 'next';
import { PageHeader } from '../../../../components/ui';
import { DocumentList } from '../../../../components/document-list';
import { isLocale, translatorFor, type Locale } from '../../../../i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translatorFor(locale);
  return { title: t('purchasingTitle') };
}

export default async function PurchasingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('purchasingTitle')} description={t('purchasingDescription')} />
      <DocumentList
        locale={typedLocale}
        endpoint="/purchasing/orders"
        createPermission="purchase-order:create"
        newHref={`/${typedLocale}/purchasing/orders/new`}
        newKey="newPurchaseOrder"
        addFirstKey="addFirstPurchaseOrder"
        emptyKey="noPurchaseOrders"
        issuePermission="purchase-order:issue"
        cancelPermission="purchase-order:cancel"
      />
    </div>
  );
}