import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { GoodsReceiptForm } from '@/components/goods-receipt-form';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('newGoodsReceipt') : 'New goods receipt' };
}

export default async function NewGoodsReceiptPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('newGoodsReceipt')} description={t('purchasingDescription')} />
      <GoodsReceiptForm locale={typedLocale} />
    </div>
  );
}
