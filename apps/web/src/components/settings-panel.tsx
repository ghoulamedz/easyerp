'use client';

import { LocaleSwitcher } from './locale-switcher';
import { ThemeSwitch } from './theme-switch';
import { Card, CardBody, CardHeader } from './ui';
import { translatorFor, type Locale } from '../i18n/config';

/**
 * Settings.
 *
 * Two sections that work — appearance and language, both saved on this device —
 * and one that is deliberately inert. The business fields are shown empty and
 * disabled rather than filled with placeholders that look like data: no endpoint
 * accepts them yet, and a form that pretends to save is worse than a form that
 * admits it cannot.
 */
export function SettingsPanel({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('settingsAppearance')} />
        <CardBody>
          {/* Named "Apparence", not "Thème": the topbar renders a second copy of
              this switch, and two identically named radiogroups read as two
              unrelated controls. */}
          <ThemeSwitch t={t} label={t('settingsAppearance')} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('settingsLanguage')} />
        <CardBody>
          <LocaleSwitcher locale={locale} label={t('localeLabel')} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('settingsBusiness')} description={t('settingsNotPersisted')} />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-3">
            {(['settingsBusinessName', 'settingsVatRegime', 'settingsCurrency'] as const).map(
              (key) => (
                <div key={key}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                    {t(key)}
                  </dt>
                  {/* Unset, and shown as unset. A filled-in value nobody entered is
                    data that lies. */}
                  <dd className="mt-1 text-sm text-ink-subtle">{t('settingsPlaceholder')}</dd>
                </div>
              ),
            )}
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
