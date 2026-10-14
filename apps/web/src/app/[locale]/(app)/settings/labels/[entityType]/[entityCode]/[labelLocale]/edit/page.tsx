import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { LabelEditForm } from '@/components/label-edit-form';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; entityType: string; entityCode: string; labelLocale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('editLabel') : 'Edit label' };
}

export default async function EditLabelPage({
  params,
}: {
  params: Promise<{ locale: string; entityType: string; entityCode: string; labelLocale: string }>;
}) {
  const { locale, entityType, entityCode, labelLocale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('editLabel')} />
      <LabelEditForm
        locale={typedLocale}
        entityType={entityType}
        entityCode={entityCode}
        labelLocale={labelLocale}
      />
    </div>
  );
}