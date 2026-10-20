'use client';

import { useEffect, useState } from 'react';
import { LocaleSwitcher } from './locale-switcher';
import { SettingsNav } from './settings-nav';
import { ThemeSwitch } from './theme-switch';
import { Button, Card, CardBody, CardHeader } from './ui';
import { ApiError, apiGet, apiSend } from '../lib/api';
import { useSession } from '../lib/client-session';
import { translatorFor, type Locale } from '../i18n/config';
import type { BusinessProfile } from '@easyerp/contracts';

export function SettingsPanel({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const { session } = useSession();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [legalName, setLegalName] = useState('');
  const [taxIdentifier, setTaxIdentifier] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [vatRegime, setVatRegime] = useState<'STANDARD' | 'EXEMPT'>('STANDARD');
  const [currency, setCurrency] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');

  // Password-confirm step: every save re-verifies the session password first.
  const [confirmStep, setConfirmStep] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiGet<BusinessProfile>('/settings/business')
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setLegalName(data.legalName ?? '');
        setTaxIdentifier(data.taxIdentifier ?? '');
        setCountryCode(data.countryCode ?? '');
        setVatRegime(data.vatRegime);
        setCurrency(data.currency ?? '');
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

  const openConfirm = (): void => {
    setError(null);
    setSaved(false);
    setPassword('');
    setConfirmStep(true);
  };

  const closeConfirm = (): void => {
    setConfirmStep(false);
    setPassword('');
  };

  const onConfirmSave = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const sessionEmail = session?.user.email;
      if (!sessionEmail) {
        setError(t('signInError'));
        return;
      }
      // No password-verify endpoint exists: re-sign-in as the session user.
      // A 200 confirms the password; a 401 means it was wrong. Harmless
      // either way — signing in as yourself changes nothing.
      // NOTE: bare fetch, not apiSend — apiSend redirects to sign-in on 401,
      // but here a 401 is the expected wrong-password signal, not a dead session.
      const check = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sessionEmail, password }),
      });
      if (!check.ok) {
        setError(t('signInError'));
        return;
      }
      const updated = await apiSend<BusinessProfile>('/settings/business', 'PATCH', {
        legalName: legalName.trim() || undefined,
        taxIdentifier: taxIdentifier.trim() || undefined,
        countryCode: countryCode.trim().toUpperCase() || undefined,
        vatRegime,
        currency: currency.trim().toUpperCase() || undefined,
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
      closeConfirm();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError(e.message);
      else setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* First, because it is the way to everything else: the rail links to
          `/settings` and stops there, so without this list the seven screens below
          are reachable only by typing their URL. */}
      <Card>
        <CardHeader title={t('settingsTitle')} />
        <CardBody>
          <SettingsNav locale={locale} />
        </CardBody>
      </Card>

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
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="settings-legal" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupLegalName')}</label>
                  <input id="settings-legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="settings-taxid" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupTaxIdentifier')}</label>
                  <input id="settings-taxid" dir="ltr" value={taxIdentifier} onChange={(e) => setTaxIdentifier(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="settings-country" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupCountryCode')}</label>
                  <input id="settings-country" dir="ltr" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                </div>
                <div>
                  <label htmlFor="settings-vat" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupVatRegime')}</label>
                  <select id="settings-vat" value={vatRegime} onChange={(e) => setVatRegime(e.target.value as 'STANDARD' | 'EXEMPT')} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none">
                    <option value="STANDARD">{t('setupVatStandard')}</option>
                    <option value="EXEMPT">{t('setupVatExempt')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="settings-currency" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('setupCurrency')}</label>
                  <input id="settings-currency" dir="ltr" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
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

              {confirmStep ? (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="settings-password" className="mb-1.5 block text-xs font-medium text-ink-muted">{t('stockPasswordConfirm')}</label>
                    <input id="settings-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="primary" disabled={saving} onClick={() => void onConfirmSave()}>
                      {saving ? t('loading') : t('save')}
                    </Button>
                    <Button type="button" variant="secondary" disabled={saving} onClick={closeConfirm}>
                      {t('cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="primary" disabled={saving} onClick={openConfirm}>
                  {t('save')}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-danger">{error ?? t('loadFailed')}</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
