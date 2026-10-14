import type { Metadata } from 'next';
import { UsersList } from '@/components/users-list';
import { PermissionCatalogue } from '@/components/permission-catalogue';
import { PageHeader } from '@/components/ui';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('navPermissions') : 'Permissions' };
}

export default async function PermissionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('usersTitle')} description={t('usersDescription')} />
      <UsersList locale={typedLocale} />
      <details className="rounded-lg border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">{t('rolePermissions')} — {t('permissionsTotal', { count: 63 })}</summary>
        <div className="mt-4">
          <PermissionCatalogue locale={typedLocale} />
        </div>
      </details>
    </div>
  );
}
