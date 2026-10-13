import type { Metadata } from 'next';
import { PageHeader } from '../../../../../components/ui';
import { CreditNoteForm } from '../../../../../components/credit-note-form';
import { isLocale, translatorFor, type Locale } from '../../../../../i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: isLocale(locale) ? translatorFor(locale)('newCreditNote') : 'New credit note' };
}

export default async function NewCreditNotePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  return (
    <div className="space-y-6">
      <PageHeader title={t('newCreditNote')} description={t('creditNotesDescription')} />
      <CreditNoteForm locale={typedLocale} />
    </div>
  );
}
