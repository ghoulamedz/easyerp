'use client';

import { useEffect, useState } from 'react';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeSwitch } from './theme-switch';
import { Button, Card, CardBody, CardHeader } from './ui';
import { ApiError, apiGet, apiSend } from '../lib/api';
import { translatorFor, type Locale } from '../i18n/config';
import type { BusinessProfile } from '@easyerp/contracts';

export function SettingsPanel({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiGet<BusinessProfile>('/settings/business')
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setDisplayName(data.displayName ?? '');
        setPhone(data.phone ?? '');
        setEmail(data.email ?? '');
        setAddressLine1(data.addressLine1 ?? '');
        setAddressLine2(data.addressLine2 ?? '');
        setCity(data.city ?? '');
        setPostalCode(data.postalCode ?? '');
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const onSave = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiSend<BusinessProfile>('/settings/business', 'PATCH', {
        displayName: displayName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        addressLine1: addressLine1.trim() || undefined,
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
      });
      setProfile(updated);
      setSaved(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError(e.message);
      else setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('settingsAppearance')} />
        <CardBody>
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
        <CardHeader title={t('settingsBusiness')} />
        <CardBody>
          {loading ? (
            <p className="text-sm text-ink-muted">{t('loading')}</p>
          ) : profile ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{t('settingsBusinessName')}</dt>
                  <dd className="mt-1 text-sm text-ink-muted">{profile.legalName} <span className="text-xs">({t('settingsLocked')})</span></dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{t('settingsVatRegime')}</dt>
                  <dd className="mt-1 text-sm text-ink-muted">{profile.vatRegime} <span className="text-xs">({t('settingsLocked')})</span></dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{t('settingsCurrency')}</dt>
                  <dd className="mt-1 text-sm text-ink-muted">{profile.currency} <span className="text-xs">({t('settingsLocked')})</span></dd>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="settings-display" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupDisplayName')}</label>
                  <input id="settings-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="settings-phone" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupPhone')}</label>
                  <input id="settings-phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="settings-email" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupEmail')}</label>
                  <input id="settings-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="settings-city" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupCity')}</label>
                  <input id="settings-city" value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="settings-addr1" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupAddress1')}</label>
                  <input id="settings-addr1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="settings-addr2" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupAddress2')}</label>
                  <input id="settings-addr2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="settings-postal" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupPostalCode')}</label>
                  <input id="settings-postal" dir="ltr" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                </div>
              </div>

              {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
              {saved ? <p role="status" className="text-sm text-ok">{t('saved')}</p> : null}

              <Button type="button" variant="primary" disabled={saving} onClick={onSave}>
                {saving ? t('loading') : t('save')}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-danger">{error ?? t('loadFailed')}</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
