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
  return { title: t('productionTitle') };
}

export default async function ProductionPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('productionTitle')} description={t('productionDescription')} />
      <DocumentList
        locale={typedLocale}
        endpoint="/production/orders"
        createPermission="production-order:create"
        newHref={`/${typedLocale}/production/orders/new`}
        newKey="newProductionOrder"
        addFirstKey="addFirstProductionOrder"
        emptyKey="noProductionOrders"
        issuePermission="production-order:issue"
        cancelPermission="production-order:cancel"
      />
    </div>
  );
}