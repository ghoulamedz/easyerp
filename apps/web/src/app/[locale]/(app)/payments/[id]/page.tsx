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
  return { title: `${t('paymentsTitle')} ${id} · ${t('appName')}` };
}

export default async function PaymentDetailPage({
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
        title={`${t('paymentsTitle')} #${id}`}
        description={t('paymentsDescription')}
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
            <CardHeader title={t('paymentDetails')} />
            <CardBody>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-ink-subtle">{t('paymentNumber')}</p>
                    <p className="font-medium">{id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-subtle">{t('paymentDate')}</p>
                    <p className="font-medium">{t('date')} · YYYY-MM-DD</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('paymentParty')}</p>
                  <p className="font-medium">{t('customer')} #Customer</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('paymentAmount')}</p>
                  <p className="font-medium">{t('amount')} · 0.000</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('paymentMethod')}</p>
                  <p className="font-medium">—</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('paymentReference')}</p>
                  <p className="font-medium">—</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('paymentNote')}</p>
                  <p className="font-medium">—</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('paymentUnallocatedCredit')}</p>
                  <p className="font-medium">{t('amount')} · 0.000</p>
                </div>
                <div>
                  <p className="text-xs text-ink-subtle">{t('paymentCreatedAt')}</p>
                  <p className="font-medium">{t('date')} · YYYY-MM-DD</p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('paymentAllocations')} />
            <CardBody>
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 text-xs">
                    <div className="col-span-6">{t('paymentAllocationDocument')}</div>
                    <div className="col-span-3">
                      <span className="inline-flex items-center rounded-md bg-surface-sunken px-2 py-0.5">
                        Customer Invoice #INV-{i}
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