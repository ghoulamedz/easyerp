import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { IconChevronLeft, IconPrinter, IconDownload } from '@/components/icons';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const t = translatorFor(locale);
  return { title: `${t('invoiceTitle')} ${id} · ${t('appName')}` };
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  if (!isLocale(locale)) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t('invoiceTitle')} #${id}`}
        description={t('invoiceDescription')}
        action={
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-sunken">
              <IconPrinter className="size-4" />
              {t('printButton')}
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-sunken">
              <IconDownload className="size-4" />
              {t('downloadButton')}
            </button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title={t('invoiceDetails')} />
            <CardBody>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-ink-subtle">{t('invoiceNumber')}</p>
                    <p className="font-medium">{id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-subtle">{t('invoiceCustomer')}</p>
                    <p className="font-medium">{t('customer')} #Customer</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('invoiceStatus')}</p>
                  <span className="inline-flex items-center rounded-full bg-ok/10 px-2.5 py-0.5 text-xs font-medium text-ok">
                    {t('statusIssued')}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('invoiceDate')}</p>
                  <p className="font-medium">{t('date')} · YYYY-MM-DD</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('invoiceSubtotal')}</p>
                  <p className="font-medium">{t('amount')} · 0.000</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('invoiceTax')}</p>
                  <p className="font-medium">{t('amount')} · 0.000</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('invoiceTotal')}</p>
                  <p className="font-medium">{t('amount')} · 0.000</p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('invoiceLines')} />
            <CardBody>
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 text-xs">
                    <div className="col-span-6">{t('item')}</div>
                    <div className="col-span-3">
                      <span className="inline-flex items-center rounded-md bg-surface-sunken px-2 py-0.5">
                        {i}x
                      </span>
                    </div>
                    <div className="col-span-3 text-right">{t('currency')} · 0.000</div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t('invoiceArchive')} />
            <CardBody>
              <p className="text-xs text-ink-muted">
                {t('invoiceArchiveDescription')}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
