import type { Metadata } from 'next';
import { StatusPanel } from '../../../../components/status-panel';
import { Badge, Card, CardBody, CardHeader, PageHeader } from '../../../../components/ui';
import {
  IconDatabase,
  IconGrid,
  IconReceipt,
  IconShield,
  IconSparkles,
} from '../../../../components/icons';
import { isLocale, translatorFor, type Locale } from '../../../../i18n/config';

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

  const modules = [
    {
      key: 'stock',
      icon: IconDatabase,
      title: t('moduleStock'),
      body: t('moduleStockBody'),
      state: 'planned',
    },
    {
      key: 'sales',
      icon: IconGrid,
      title: t('moduleSales'),
      body: t('moduleSalesBody'),
      state: 'planned',
    },
    {
      key: 'invoicing',
      icon: IconReceipt,
      title: t('moduleInvoicing'),
      body: t('moduleInvoicingBody'),
      state: 'planned',
    },
    {
      key: 'custom',
      icon: IconSparkles,
      title: t('moduleCustomFields'),
      body: t('moduleCustomFieldsBody'),
      state: 'planned',
    },
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader title={`${t('dashboardGreeting')}, ${t('appName')}`} description={t('tagline')} />

      <StatusPanel locale={typedLocale} />

      <Card>
        <CardHeader title={t('dashboardPhase')} description={t('dashboardPhaseBody')} />
        <CardBody>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="ok">
              <IconShield className="size-3.5" />
              {t('navPermissions')}
            </Badge>
            <Badge tone="ok">{t('appearance')}</Badge>
            <Badge tone="ok">{t('settingsLanguage')}</Badge>
            {modules.map((module) => (
              <Badge key={module.key} tone="neutral">
                {module.title}
              </Badge>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('dashboardQuickTitle')} description={t('dashboardQuickBody')} />
        <CardBody>
          <ul className="grid gap-3 sm:grid-cols-2">
            {modules.map((module) => (
              <li
                key={module.key}
                className="flex gap-3 rounded-lg border border-line bg-surface p-3"
              >
                <span className="mt-0.5 text-ink-subtle">
                  <module.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{module.title}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">{module.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
