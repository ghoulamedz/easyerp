import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { ProductionOrderUnifiedForm } from '@/components/production-order-unified';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('editProductionOrder') : 'Edit production order' };
}

export default async function EditProductionOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('editProductionOrder')} description={t('productionDescription')} />
      <ProductionOrderUnifiedForm locale={typedLocale} id={id} />
    </div>
  );
}