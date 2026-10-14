import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { ModulesList } from '@/components/modules-list';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translatorFor(locale);
  return { title: t('modulesTitle') };
}

export default async function ModulesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('modulesTitle')} description={t('modulesDescription')} />
      <ModulesList locale={typedLocale} />
    </div>
  );
}