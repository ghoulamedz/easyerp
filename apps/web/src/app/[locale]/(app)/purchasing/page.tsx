import type { Metadata } from 'next';
import Link from 'next/link';
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
      <Link
        href={`/${typedLocale}/purchasing/receipts`}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
      >
        {t('newGoodsReceipt')}
      </Link>
    </div>
  );
}