import type { Metadata } from 'next';
import { StatusPanel } from '@/components/status-panel';
import { PageHeader } from '@/components/ui';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';
import { serverApiGet } from '../../../../lib/server-api';
import type { BusinessProfile, SessionUser } from '@easyerp/contracts';

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

  const [business, sessionUser] = await Promise.all([
    serverApiGet<BusinessProfile>('/settings/business'),
    // The guards' SessionUser, not Better Auth's raw get-session (which
    // carries no displayName or permissions) — the same source the web
    // session hook reads.
    serverApiGet<SessionUser>('/users/me'),
  ]);
  const businessName = business?.displayName ?? business?.legalName ?? t('appName');
  const greetingName = sessionUser?.displayName ?? businessName;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t('dashboardGreeting')}, ${greetingName}`}
        description={`${businessName} · ${t('tagline')}`}
        // Back lands on the dashboard, so a control here would be a loop.
        hideBack
      />

      <StatusPanel locale={typedLocale} />
    </div>
  );
}
