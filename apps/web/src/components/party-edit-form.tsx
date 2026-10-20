'use client';

/**
 * Edit Party form.
 *
 * Loads an existing Party and allows changing its properties.
 * A Party holds one or both commercial roles (CUSTOMER, SUPPLIER); holding
 * both is normal and never needs two records.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PARTY_ROLES } from '@easyerp/contracts';
import { apiGet, apiSend } from '../lib/api';
import { translatorFor, type Locale } from '../i18n/config';
import { Button, Card, CardBody } from './ui';
import { IconAlert } from './icons';

const FIELD =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none';

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink-muted">
      {children}
    </label>
  );
}

export function PartyEditForm({ locale, id }: { locale: Locale; id: string }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<readonly string[]>([]);
  const [taxIdentifier, setTaxIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [countryCode, setCountryCode] = useState('TN');
  const [isActive, setIsActive] = useState(true);

  const [loadingParty, setLoadingParty] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<unknown>(`/parties/${id}`)
      .then((data) => {
        if (cancelled) return;
        const party = data as { code: string; name: string; roles: readonly string[]; taxIdentifier?: string | null; email?: string | null; phone?: string | null; address?: string | null; city?: string | null; countryCode?: string | null; isActive: boolean };
        setCode(party.code);
        setName(party.name);
        setRoles(party.roles);
        setTaxIdentifier(party.taxIdentifier ?? '');
        setEmail(party.email ?? '');
        setPhone(party.phone ?? '');
        setAddress(party.address ?? '');
        setCity(party.city ?? '');
        setCountryCode(party.countryCode ?? 'TN');
        setIsActive(party.isActive);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingParty(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const toggleRole = (role: string): void => {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const optional = (value: string): string | null =>
        value.trim() === '' ? null : value.trim();
      await apiSend(`/parties/${id}`, 'PATCH', {
        code: code.trim(),
        name: name.trim(),
        roles,
        taxIdentifier: optional(taxIdentifier),
        email: optional(email),
        phone: optional(phone),
        address: optional(address),
        city: optional(city),
        countryCode: countryCode.trim() === '' ? null : countryCode.trim().toUpperCase(),
        isActive,
      });
      router.push(`/${locale}/parties`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
      // Re-enable only when the write failed. On success the screen is leaving,
      // and clearing the flag while Next navigates is what made the button
      // clickable again mid-navigation — a second click then posts twice.
      setWorking(false);
    }
  };

  if (loadingParty) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">{t('loading')}</p>
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardBody>
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <IconAlert className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="party-code">{t('partyCode')}</Label>
              <input
                id="party-code"
                required
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="party-name">{t('partyName')}</Label>
              <input
                id="party-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-ink-muted">
                {t('partyRolesLabel')}
              </span>
              <div className="flex gap-4">
                {PARTY_ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={roles.includes(role)}
                      onChange={() => toggleRole(role)}
                    />
                    {role === 'CUSTOMER' ? t('customer') : t('roleSupplier')}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="party-taxid">{t('partyTaxId')}</Label>
              <input
                id="party-taxid"
                dir="ltr"
                value={taxIdentifier}
                onChange={(e) => setTaxIdentifier(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="party-email">{t('setupEmail')}</Label>
              <input
                id="party-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="party-phone">{t('setupPhone')}</Label>
              <input
                id="party-phone"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="party-country">{t('setupCountryCode')}</Label>
              <input
                id="party-country"
                dir="ltr"
                maxLength={2}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="party-addr">{t('setupAddress1')}</Label>
              <input
                id="party-addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="party-city">{t('setupCity')}</Label>
              <input
                id="party-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={FIELD}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                {t('formActive')}
              </label>
            </div>
          </div>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={working} className="w-full">
            {working ? t('formSaving') : t('formSave')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}