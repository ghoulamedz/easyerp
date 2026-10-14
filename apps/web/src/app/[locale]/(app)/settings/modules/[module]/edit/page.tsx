import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { ModuleEditForm } from '@/components/module-edit-form';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; module: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('editModule') : 'Edit module' };
}

export default async function EditModulePage({
  params,
}: {
  params: Promise<{ locale: string; module: string }>;
}) {
  const { locale, module } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('editModule')} description={t('modulesDescription')} />
      <ModuleEditForm locale={typedLocale} module={module} />
    </div>
  );
}