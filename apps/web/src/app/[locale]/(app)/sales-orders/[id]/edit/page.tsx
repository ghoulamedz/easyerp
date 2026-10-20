import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { SalesOrderUnifiedForm } from '@/components/sales-order-unified';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('editSalesOrder') : 'Edit sales order' };
}

export default async function EditSalesOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('editSalesOrder')} description={t('salesOrdersDescription')} />
      <SalesOrderUnifiedForm locale={typedLocale} id={id} />
    </div>
  );
}