import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { PurchaseOrderUnifiedForm } from '@/components/purchase-order-unified';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('editPurchaseOrder') : 'Edit purchase order' };
}

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('editPurchaseOrder')} description={t('purchasingDescription')} />
      <PurchaseOrderUnifiedForm locale={typedLocale} id={id} />
    </div>
  );
}