import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { DocumentList } from '@/components/document-list';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = translatorFor(locale);
  return { title: t('creditNotesTitle') };
}

export default async function CreditNotesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('creditNotesTitle')} description={t('creditNotesDescription')} />
      <DocumentList
        locale={typedLocale}
        endpoint="/credit-notes"
        createPermission="credit-note:create"
        newHref={`/${typedLocale}/credit-notes/new`}
        newKey="newCreditNote"
        addFirstKey="addFirstCreditNote"
        emptyKey="noCreditNotes"
        issuePermission="credit-note:issue"
      />
    </div>
  );
}