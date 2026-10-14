import type { Metadata } from 'next';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { IconChevronLeft, IconDatabase, IconAlertTriangle } from '@/components/icons';
import { isLocale, translatorFor, type Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) return {};
  const t = translatorFor(locale);
  return { title: `${t('stockTitle')} ${id} · ${t('appName')}` };
}

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const typedLocale: Locale = (isLocale(locale) ? locale : 'fr') as Locale;
  const t = translatorFor(typedLocale);

  if (!isLocale(locale)) return null as never;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t('stockTitle')} #${id}`}
        description={t('stockItemDescription')}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t('stockPosition')} />
            <CardBody>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-ink-subtle">{t('onHand')}</p>
                    <p className="text-lg font-bold">0</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-subtle">{t('reserved')}</p>
                    <p className="text-lg font-bold">0</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-subtle">{t('available')}</p>
                    <p className="text-lg font-bold">0</p>
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-surface p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs text-ink-subtle">
                    <IconAlertTriangle className="size-4" />
                    <span>{t('stockReorderNote')}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-line">
                    <div className="h-full w-[80%] rounded bg-ok" />
                  </div>
                  <p className="mt-2 text-xs text-ok">{t('stockReorderLevel')}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t('stockLedger')} />
            <CardBody>
              <p className="text-xs text-ink-muted">{t('stockLedgerDescription')}</p>
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-line bg-surface p-3">
                  <p className="text-xs text-ink-subtle">{t('openingBalanceEntry')}</p>
                </div>
                <div className="rounded-lg border border-line bg-surface p-3">
                  <p className="text-xs text-ink-subtle">{t('salesOrderEntry')}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t('stockHistory')} />
            <CardBody>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-3">
                  <span className="text-xs text-ink-subtle">{t('date')}</span>
                  <span className="text-xs font-medium">{t('YYYY-MM-DD')}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-3">
                  <span className="text-xs text-ink-subtle">{t('source')}</span>
                  <span className="text-xs font-medium">{t('openingBalance')}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-3">
                  <span className="text-xs text-ink-subtle">{t('quantity')}</span>
                  <span className="text-xs font-medium">+0</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
