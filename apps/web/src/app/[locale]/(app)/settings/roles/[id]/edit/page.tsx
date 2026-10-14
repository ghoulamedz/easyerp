import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { RoleEditForm } from '@/components/role-edit-form';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('editRole') : 'Edit role' };
}

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('editRole')} description={t('rolesDescription')} />
      <RoleEditForm locale={typedLocale} id={id} />
    </div>
  );
}