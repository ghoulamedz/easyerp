import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { PurchaseOrderForm } from '@/components/purchase-order-form';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('newPurchaseOrder') : 'New purchase order' };
}

export default async function NewPurchaseOrderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('newPurchaseOrder')} description={t('purchasingDescription')} />
      <PurchaseOrderForm locale={typedLocale} />
    </div>
  );
}
