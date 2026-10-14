import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { SalesOrderForm } from '@/components/sales-order-form';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('newSalesOrder') : 'New sales order' };
}

export default async function NewSalesOrderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('newSalesOrder')} description={t('salesOrdersDescription')} />
      <SalesOrderForm locale={typedLocale} />
    </div>
  );
}
