'use client';

/**
 * New Payment form.
 *
 * Money received, not a Document: no number, no status, no archive. Allocations
 * assign part of the payment to the party's issued fiscal Documents; whatever
 * is left over stays unallocated credit. The server refuses
 * `sum(allocations) > amount`, so the form keeps a running remainder.
 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { BusinessProfile, DocumentSummary, Party } from '@easyerp/contracts';
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

function asArray<T>(data: unknown): readonly T[] {
  if (Array.isArray(data)) return data as readonly T[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: readonly T[] }).items;
  }
  return [];
}

export function PaymentForm({ locale }: { locale: Locale }) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [businessId, setBusinessId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [parties, setParties] = useState<readonly Party[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [documents, setDocuments] = useState<readonly DocumentSummary[]>([]);
  const [allocations, setAllocations] = useState<Readonly<Record<string, string>>>({});

  const [loadingRefs, setLoadingRefs] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<BusinessProfile>('/settings/business'),
      apiGet<unknown>('/parties'),
      apiGet<unknown>('/sales/invoices', { status: 'ISSUED' }),
      apiGet<unknown>('/credit-notes', { status: 'ISSUED' }),
    ])
      .then(([profile, p, v, c]) => {
        if (cancelled) return;
        setBusinessId(profile.id);
        const customers = asArray<Party>(p).filter((party) => party.roles.includes('CUSTOMER'));
        setParties(customers);
        if (customers.length > 0) setPartyId(customers[0]?.id ?? '');
        setDocuments([...asArray<DocumentSummary>(v), ...asArray<DocumentSummary>(c)]);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoadingRefs(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const partyDocs = useMemo(
    () => documents.filter((doc) => doc.partyId === partyId),
    [documents, partyId],
  );

  const allocated = useMemo(
    () =>
      Object.values(allocations).reduce((sum, value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? sum + parsed : sum;
      }, 0),
    [allocations],
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const optional = (value: string): string | undefined =>
        value.trim() === '' ? undefined : value.trim();
      await apiSend('/payments', 'POST', {
        businessId,
        partyId,
        amount: amount.trim(),
        ...(receivedAt === '' ? {} : { receivedAt: `${receivedAt}T00:00:00.000Z` }),
        ...(optional(method) ? { method: optional(method) } : {}),
        ...(optional(reference) ? { reference: optional(reference) } : {}),
        ...(optional(note) ? { note: optional(note) } : {}),
        allocations: Object.entries(allocations)
          .filter(([, value]) => value.trim() !== '' && Number(value) > 0)
          .map(([documentId, value]) => ({ documentId, amount: value.trim() })),
      });
      router.push(`/${locale}/payments`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
    } finally {
      setWorking(false);
    }
  };

  if (loadingRefs) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-ink-muted">{t('loading')}</p>
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
              <Label htmlFor="payment-party">{t('customer')}</Label>
              <select
                id="payment-party"
                required
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className={FIELD}
              >
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name} ({party.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="payment-amount">{t('paymentAmount')}</Label>
              <input
                id="payment-amount"
                required
                dir="ltr"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="payment-date">{t('paymentDate')}</Label>
              <input
                id="payment-date"
                type="date"
                dir="ltr"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="payment-method">{t('paymentMethod')}</Label>
              <input
                id="payment-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="payment-ref">{t('paymentReference')}</Label>
              <input
                id="payment-ref"
                dir="ltr"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="payment-note">{t('paymentNote')}</Label>
              <input
                id="payment-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={FIELD}
              />
            </div>
          </div>

          {partyDocs.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-ink">{t('paymentAllocations')}</legend>
              {partyDocs.map((doc) => (
                <div key={doc.id} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {doc.number ?? t('statusDraft')} — {doc.grossAmount} {doc.currency}
                    </p>
                  </div>
                  <div className="w-32">
                    <Label htmlFor={`alloc-${doc.id}`}>{t('paymentAllocationAmount')}</Label>
                    <input
                      id={`alloc-${doc.id}`}
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="0"
                      value={allocations[doc.id] ?? ''}
                      onChange={(e) =>
                        setAllocations((prev) => ({ ...prev, [doc.id]: e.target.value }))
                      }
                      className={FIELD}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-ink-subtle">
                {t('paymentUnallocatedCredit')}: {(Number(amount) || 0) - allocated}
              </p>
            </fieldset>
          ) : null}

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" disabled={working} className="w-full">
            {working ? t('formCreating') : t('formCreate')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
