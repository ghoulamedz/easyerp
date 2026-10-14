import type { Metadata } from 'next';
import { SettingsPanel } from '@/components/settings-panel';
import { PageHeader } from '@/components/ui';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('settingsTitle') : 'Settings' };
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('settingsTitle')} description={t('settingsDescription')} />
      <SettingsPanel locale={typedLocale} />
    </div>
  );
}
