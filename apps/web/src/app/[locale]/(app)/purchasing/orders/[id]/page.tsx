import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { DocumentPaperDetail } from '@/components/paper-detail';
import { paperDetailLabels } from '@/components/paper-detail-labels';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const t = translatorFor(locale);
  return { title: `${t('purchasingTitle')} ${id} · ${t('appName')}` };
}

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const typedLocale: Locale = locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('purchasingTitle')} description={t('purchasingDescription')} />
      <DocumentPaperDetail
        paper="/purchasing/orders"
        id={id}
        labels={paperDetailLabels(typedLocale, 'supplier')}
      />
    </div>
  );
}
