'use client';

/**
 * First-run Setup (ADR 0012, spec 001 stories 1–7).
 *
 * The one unauthenticated write in the product: it opens only while no
 * Business exists and closes permanently afterwards. One form, one request —
 * Business, first Administrator, Units and Tax Rates in a single transaction —
 * because a Business with no Unit, no Tax Rate or no numbering pattern is a
 * Business whose first invoice cannot be issued. Afterwards, configuration is
 * ordinary authenticated Settings work, never a wizard.
 */

import { useState, type FormEvent, useCallback } from 'react';
import Link from 'next/link';
import { ApiError, apiSend } from '../lib/api';
import { Button, Card, CardBody, CardHeader } from './ui';
import { IconAlert, IconCheck, IconEye, IconEyeOff } from './icons';
import { translatorFor, type Locale, LOCALES } from '../i18n/config';
import { ThemeSwitch } from './theme-switch';
import { LocaleSwitcher } from './locale-switcher';

interface UnitRow {
  id: string;
  code: string;
  allowsFraction: boolean;
}

interface RateRow {
  id: string;
  code: string;
  rate: string;
}

const FIELD =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none';

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink-muted">
      {children}
    </label>
  );
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function SetupScreen({ locale, dbError }: { locale: Locale; dbError?: string | null }) {
  const t = translatorFor(locale);

  // Prefill is a development convenience only: production ships empty fields
  // so no token, name or password ever leaves in the bundle.
  const devPrefill = process.env.NODE_ENV === 'development';
  const seed = (value: string): string => (devPrefill ? value : '');

  const [token, setToken] = useState(seed('dev-first-setup-token'));
  const [legalName, setLegalName] = useState(seed('My Company SARL'));
  const [displayName, setDisplayName] = useState(seed('My Company'));
  const [taxIdentifier, setTaxIdentifier] = useState(seed('1234567/A/M/000'));
  const [countryCode, setCountryCode] = useState(seed('TN'));
  const [vatRegime, setVatRegime] = useState<'STANDARD' | 'EXEMPT'>('STANDARD');
  const [currency, setCurrency] = useState(seed('TND'));
  const [phone, setPhone] = useState(seed('+216 12 345 678'));
  const [email, setEmail] = useState(seed('contact@mycompany.tn'));
  const [addressLine1, setAddressLine1] = useState(seed('123 Main Street'));
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState(seed('Tunis'));
  const [postalCode, setPostalCode] = useState(seed('1000'));
  const [adminName, setAdminName] = useState(seed('Admin User'));
  const [adminEmail, setAdminEmail] = useState(seed('admin@mycompany.tn'));
  const [adminPassword, setAdminPassword] = useState(seed('password123'));
  const [units, setUnits] = useState<UnitRow[]>(
    devPrefill
      ? [
          { id: 'initial-pcs', code: 'PCS', allowsFraction: false },
          { id: 'initial-kg', code: 'KG', allowsFraction: true },
        ]
      : [],
  );
  const [rates, setRates] = useState<RateRow[]>(
    devPrefill
      ? [
          { id: 'initial-tva19', code: 'TVA19', rate: '19' },
          { id: 'initial-tva13', code: 'TVA13', rate: '13' },
          { id: 'initial-tva07', code: 'TVA07', rate: '7' },
        ]
      : [],
  );

  // Show/hide states for password fields
  const [showToken, setShowToken] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [modules, setModules] = useState<Record<string, boolean>>({
    SALES: true,
    PURCHASING: true,
    INVENTORY: true,
    FINANCE: true,
    PRODUCTION: false,
    E_INVOICING: false,
  });

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = useCallback(async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const optional = (value: string): string | undefined =>
        value.trim() === '' ? undefined : value.trim();
      await apiSend('/setup/complete', 'POST', {
        token,
        business: {
          legalName: legalName.trim(),
          displayName: displayName.trim(),
          taxIdentifier: taxIdentifier.trim(),
          countryCode: countryCode.trim().toUpperCase(),
          vatRegime,
          currency: currency.trim().toUpperCase() || 'TND',
          ...(optional(phone) ? { phone: optional(phone) } : {}),
          ...(optional(email) ? { email: optional(email) } : {}),
          ...(optional(addressLine1) ? { addressLine1: optional(addressLine1) } : {}),
          ...(optional(addressLine2) ? { addressLine2: optional(addressLine2) } : {}),
          ...(optional(city) ? { city: optional(city) } : {}),
          ...(optional(postalCode) ? { postalCode: optional(postalCode) } : {}),
        },
        administrator: {
          email: adminEmail.trim(),
          name: adminName.trim(),
          password: adminPassword,
        },
        units: units
          .filter((unit) => unit.code.trim() !== '')
          .map((unit) => ({ code: unit.code.trim(), allowsFraction: unit.allowsFraction })),
        taxRates: rates
          .filter((row) => row.code.trim() !== '' && row.rate.trim() !== '')
          .map((row) => ({ code: row.code.trim(), rate: row.rate.trim() })),
        modules,
      });
      setDone(true);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'NOT_FOUND') setClosed(true);
      else setError(failure instanceof Error ? failure.message : t('signInError'));
    } finally {
      setWorking(false);
    }
  }, [token, legalName, displayName, taxIdentifier, countryCode, vatRegime, currency, phone, email, addressLine1, addressLine2, city, postalCode, adminName, adminEmail, adminPassword, units, rates, modules, t]);

  if (done) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-10">
        <Card>
          <CardBody className="space-y-4">
            <p role="status" className="flex items-start gap-2 text-sm text-ink">
              <IconCheck className="mt-0.5 size-4 shrink-0 text-ok" />
              {t('setupDone')}
            </p>
            <Link
              href={`/${locale}/sign-in`}
              className="block text-center text-sm text-brand underline underline-offset-4 hover:no-underline"
            >
              {t('setupBackSignIn')}
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (closed) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-10">
        <Card>
          <CardBody>
            <p role="alert" className="text-sm text-ink-muted">
              {t('setupClosed')}
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Card>
        <CardHeader title={t('setupTitle')} description={t('setupIntro')} />
        <CardBody>
          {dbError ? (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                The API cannot reach the database yet — Setup is shown because this is assumed to be a fresh deployment. Fix the database connection and retry. <span className="font-mono text-xs break-all">{dbError.slice(0, 400)}</span>
              </span>
            </div>
          ) : null}
          {/* Language and Theme switchers in the header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LocaleSwitcher locale={locale} label={t('localeLabel')} />
              <ThemeSwitch t={t} compact label={t('themeLabel')} />
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <Label htmlFor="setup-token">{t('setupToken')}</Label>
              <div className="relative">
                <input
                  id="setup-token"
                  name="token"
                  type={showToken ? 'text' : 'password'}
                  autoComplete="off"
                  required
                  dir="ltr"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  className={FIELD + ' pe-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute inset-y-0 end-0 pe-3 flex items-center text-ink-subtle hover:text-ink"
                  aria-label={showToken ? t('hideToken') : t('showToken')}
                >
                  {showToken ? <IconEyeOff className="size-5" /> : <IconEye className="size-5" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-subtle">{t('setupTokenHelp')}</p>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-ink">{t('setupBusiness')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="setup-legal">{t('setupLegalName')}</Label>
                  <input
                    id="setup-legal"
                    required
                    value={legalName}
                    onChange={(event) => setLegalName(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label htmlFor="setup-display">{t('setupDisplayName')}</Label>
                  <input
                    id="setup-display"
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label htmlFor="setup-taxid">{t('setupTaxIdentifier')}</Label>
                  <input
                    id="setup-taxid"
                    required
                    dir="ltr"
                    value={taxIdentifier}
                    onChange={(event) => setTaxIdentifier(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label htmlFor="setup-country">{t('setupCountryCode')}</Label>
                  <input
                    id="setup-country"
                    required
                    dir="ltr"
                    maxLength={2}
                    placeholder="TN"
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label htmlFor="setup-regime">{t('setupVatRegime')}</Label>
                  <select
                    id="setup-regime"
                    value={vatRegime}
                    onChange={(event) =>
                      setVatRegime(event.target.value === 'EXEMPT' ? 'EXEMPT' : 'STANDARD')
                    }
                    className={FIELD}
                  >
                    <option value="STANDARD">{t('setupVatStandard')}</option>
                    <option value="EXEMPT">{t('setupVatExempt')}</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="setup-currency">{t('setupCurrency')}</Label>
                  <input
                    id="setup-currency"
                    required
                    dir="ltr"
                    maxLength={3}
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label htmlFor="setup-phone">{t('setupPhone')}</Label>
                  <input
                    id="setup-phone"
                    dir="ltr"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label htmlFor="setup-email">{t('setupEmail')}</Label>
                  <input
                    id="setup-email"
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="setup-addr1">{t('setupAddress1')}</Label>
                  <input
                    id="setup-addr1"
                    value={addressLine1}
                    onChange={(event) => setAddressLine1(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="setup-addr2">{t('setupAddress2')}</Label>
                  <input
                    id="setup-addr2"
                    value={addressLine2}
                    onChange={(event) => setAddressLine2(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label htmlFor="setup-city">{t('setupCity')}</Label>
                  <input
                    id="setup-city"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label htmlFor="setup-postal">{t('setupPostalCode')}</Label>
                  <input
                    id="setup-postal"
                    dir="ltr"
                    value={postalCode}
                    onChange={(event) => setPostalCode(event.target.value)}
                    className={FIELD}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-ink">{t('setupAdmin')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="setup-aname">{t('setupAdminName')}</Label>
                  <input
                    id="setup-aname"
                    required
                    value={adminName}
                    onChange={(event) => setAdminName(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label htmlFor="setup-aemail">{t('setupAdminEmail')}</Label>
                  <input
                    id="setup-aemail"
                    type="email"
                    required
                    dir="ltr"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                    className={FIELD}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="setup-apw">{t('setupAdminPassword')}</Label>
                  <div className="relative">
                    <input
                      id="setup-apw"
                      type={showAdminPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      dir="ltr"
                      value={adminPassword}
                      onChange={(event) => setAdminPassword(event.target.value)}
                      className={FIELD + ' pe-10'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      className="absolute inset-y-0 end-0 pe-3 flex items-center text-ink-subtle hover:text-ink"
                      aria-label={showAdminPassword ? t('hidePassword') : t('showPassword')}
                    >
                      {showAdminPassword ? <IconEyeOff className="size-5" /> : <IconEye className="size-5" />}
                    </button>
                  </div>
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-ink">{t('setupUnits')}</legend>
              {units.map((unit) => (
                <div key={unit.id} className="flex items-center gap-2">
                  <input
                    aria-label={t('setupUnitCode')}
                    required
                    dir="ltr"
                    value={unit.code}
                    onChange={(event) =>
                      setUnits(units.map((row) => (row.id === unit.id ? { ...row, code: event.target.value } : row)))
                    }
                    className={FIELD}
                  />
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={unit.allowsFraction}
                      onChange={(event) =>
                        setUnits(
                          units.map((row) =>
                            row.id === unit.id ? { ...row, allowsFraction: event.target.checked } : row,
                          ),
                        )
                      }
                    />
                    {t('setupUnitFraction')}
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={units.length === 1}
                    onClick={() => setUnits(units.filter((row) => row.id !== unit.id))}
                  >
                    {t('setupRemove')}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setUnits([...units, { id: generateId(), code: '', allowsFraction: true }])}
              >
                {t('setupAddUnit')}
              </Button>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-ink">{t('setupRates')}</legend>
              {rates.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <input
                    aria-label={t('setupRateCode')}
                    dir="ltr"
                    placeholder="TVA19"
                    value={row.code}
                    onChange={(event) =>
                      setRates(rates.map((entry) => (entry.id === row.id ? { ...entry, code: event.target.value } : entry)))
                    }
                    className={FIELD}
                  />
                  <input
                    aria-label={t('setupRateValue')}
                    dir="ltr"
                    inputMode="decimal"
                    placeholder="19"
                    value={row.rate}
                    onChange={(event) =>
                      setRates(rates.map((entry) => (entry.id === row.id ? { ...entry, rate: event.target.value } : entry)))
                    }
                    className={FIELD}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRates(rates.filter((entry) => entry.id !== row.id))}
                  >
                    {t('setupRemove')}
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setRates([...rates, { id: generateId(), code: '', rate: '' }])}
              >
                {t('setupAddRate')}
              </Button>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-ink">{t('modulesTitle')}</legend>
              <p className="text-xs text-ink-subtle">{t('modulesBody')}</p>
              {(['SALES', 'PURCHASING', 'INVENTORY', 'FINANCE', 'PRODUCTION', 'E_INVOICING'] as const).map((mod) => (
                <label key={mod} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={modules[mod] ?? false}
                    onChange={(e) => setModules({ ...modules, [mod]: e.target.checked })}
                  />
                  {mod}
                  {mod === 'PRODUCTION' ? ` — ${t('bomsTitle')}` : ''}
                </label>
              ))}
            </fieldset>

            {error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
              >
                <IconAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" disabled={working} className="w-full">
              {working ? t('setupWorking') : t('setupSubmit')}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}