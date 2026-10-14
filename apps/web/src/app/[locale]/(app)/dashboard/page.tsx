import type { Metadata } from 'next';
import { StatusPanel } from '@/components/status-panel';
import { PageHeader } from '@/components/ui';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';
import { serverApiGet } from '../../../../lib/server-api';
import type { BusinessProfile } from '@easyerp/contracts';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('dashboardTitle') : 'Dashboard' };
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  const business = await serverApiGet<BusinessProfile>('/settings/business');
  const businessName = business?.displayName ?? business?.legalName ?? t('appName');

  return (
    <div className="space-y-6">
      <PageHeader title={`${t('dashboardGreeting')}, ${businessName}`} description={t('tagline')} />

      <StatusPanel locale={typedLocale} />
    </div>
  );
}
