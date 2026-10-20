/* eslint-disable @next/next/no-sync-scripts -- false positive on useState declarations */
'use client';
/**
 * Production Order form — unified for create and edit.
 *
 * Create: names the BOM version to produce and the lines; money never travels
 * (ADR 0005) — the server prices every line from the Items.
 * Edit: changes the lines only (the BOM is fixed for an existing order).
 *
 * Create (no `id`): POST /production/orders → draft, then Save stays on the
 * form, Issue redirects to the list. Edit (`id` provided): PATCH
 * /production/orders/:id (draft only), then Save stays, Issue redirects to the
 * list. Issued documents are read-only everywhere (ADR 0018): no route reaches
 * here.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Bom, BomSummary, BomVersion, BusinessProfile, Item, ProductionOrder } from '@easyerp/contracts';
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

interface LineRow {
  key: string;
  itemId: string;
  quantity: string;
  description: string;
}

function asArray<T>(data: unknown): readonly T[] {
  if (Array.isArray(data)) return data as readonly T[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: readonly T[] }).items;
  }
  return [];
}

function rowKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ProductionOrderUnifiedForm({
  locale,
  id,
}: {
  locale: Locale;
  id?: string;
}) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [businessId, setBusinessId] = useState('');
  const [bomId, setBomId] = useState('');
  const [bomVersionId, setBomVersionId] = useState('');
  const [boms, setBoms] = useState<readonly BomSummary[]>([]);
  const [versions, setVersions] = useState<readonly BomVersion[]>([]);
  const [items, setItems] = useState<readonly Item[]>([]);
  const [lines, setLines] = useState<LineRow[]>([
    { key: 'line-1', itemId: '', quantity: '1', description: '' },
  ]);

  const [loadingRefs, setLoadingRefs] = useState(true);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiGet<BusinessProfile>('/settings/business'),
      Boolean(id) ? Promise.resolve(null) : apiGet<unknown>('/production/boms'),
      apiGet<unknown>('/items'),
      id ? apiGet<ProductionOrder>(`/production/orders/${id}`) : Promise.resolve(null),
    ])
      .then(([profile, b, i, order]) => {
        if (cancelled) return;
        setBusinessId(profile.id);
        const stocked = asArray<Item>(i);
        setItems(stocked);

        if (!id && b) {
          const summaries = asArray<BomSummary>(b);
          setBoms(summaries);
          if (summaries.length > 0) {
            setBomId(summaries[0]?.id ?? '');
            // Load versions after BOM is set, inside the callback to avoid lint error
            apiGet<Bom>(`/production/boms/${summaries[0]?.id}`)
              .then((detail) => {
                if (cancelled) return;
                setVersions(detail.versions);
                setBomVersionId(detail.versions[0]?.id ?? '');
              })
              .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
              });
          }
        }

        if (order) {
          if (order.status !== 'DRAFT') {
            setError(t('editOnlyDraft'));
            return;
          }
          if (id) {
            // Edit mode: load lines only, BOM is fixed
            setLines(
              order.lines.length > 0
                ? order.lines.map((line) => ({
                    key: rowKey(),
                    itemId: line.itemId,
                    quantity: line.quantity,
                    description: line.description ?? '',
                  }))
                : [{ key: 'line-1', itemId: stocked[0]?.id ?? '', quantity: '1', description: '' }],
            );
          } else {
            // Create mode: pre-select first item
            setLines((prev) =>
              prev.map((line, index) =>
                index === 0 && line.itemId === '' ? { ...line, itemId: stocked[0]?.id ?? '' } : line,
              ),
            );
          }
        } else if (!id && stocked.length > 0) {
          setLines((prev) =>
            prev.map((line, index) =>
              index === 0 && line.itemId === '' ? { ...line, itemId: stocked[0]?.id ?? '' } : line,
            ),
          );
        }
        setLoadingRefs(false);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed'));
      })
      // eslint-disable-next-line @next/next/no-sync-scripts -- loading state transitions are synchronous by design
      .finally(() => {
        if (!cancelled) setLoadingOrder(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);



  const onSubmit = async (e: FormEvent, action: 'save' | 'issue'): Promise<void> => {
    e.preventDefault();
    setError(null);
    setWorking(true);

    try {
      let res: Response;
      if (id) {
        res = await apiSend(`/production/orders/${id}`, 'PATCH', {
          lines: lines
            .filter((line) => line.itemId !== '')
            .map((line) => ({
              itemId: line.itemId,
              quantity: line.quantity.trim(),
              ...(line.description.trim() === '' ? {} : { description: line.description.trim() }),
            })),
        });
      } else {
        res = await apiSend('/production/orders', 'POST', {
          businessId,
          bomVersionId,
          lines: lines
            .filter((line) => line.itemId !== '')
            .map((line) => ({
              itemId: line.itemId,
              quantity: line.quantity.trim(),
              ...(line.description.trim() === '' ? {} : { description: line.description.trim() }),
            })),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? t('saveFailed'));

      if (action === 'issue') {
        const issueRes = await apiSend<{ ok: boolean; message?: string }>(
          `/production/orders/${data.id}/issue`,
          'POST',
          {},
        );
        if (!issueRes.ok) {
          const issueData = issueRes;
          throw new Error(issueData.message ?? t('issueFailed'));
        }
      }

      router.push(`/${locale}/production/orders`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(action === 'issue' ? 'issueFailed' : 'saveFailed'));
    } finally {
      setWorking(false);
    }
  };

  if (loadingRefs || loadingOrder) {
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
        <form className="space-y-4">
          {!id ? (
            <>
              <div>
                <Label htmlFor="order-bom">{t('prodFinishedItem')}</Label>
                <select
                  id="order-bom"
                  required
                  value={bomId}
                  onChange={(e) => setBomId(e.target.value)}
                  className={FIELD}
                >
                  {boms.map((bom) => (
                    <option key={bom.id} value={bom.id}>
                      {bom.finishedItemName} ({bom.finishedItemCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="order-bom-version">{t('prodBomVersion')}</Label>
                <select
                  id="order-bom-version"
                  required
                  value={bomVersionId}
                  onChange={(e) => setBomVersionId(e.target.value)}
                  disabled={loadingVersions}
                  className={FIELD}
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      v{version.version}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            // Edit mode: show read-only BOM info or nothing
            null
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink">{t('invoiceLines')}</legend>
            {lines.map((line) => (
              <div key={line.key} className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <Label htmlFor={`line-item-${line.key}`}>{t('item')}</Label>
                  <select
                    id={`line-item-${line.key}`}
                    required
                    value={line.itemId}
                    onChange={(e) =>
                      setLines(
                        lines.map((l) => (l.key === line.key ? { ...l, itemId: e.target.value } : l)),
                      )
                    }
                    className={FIELD}
                  >
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <Label htmlFor={`line-qty-${line.key}`}>{t('quantity')}</Label>
                  <input
                    id={`line-qty-${line.key}`}
                    required
                    dir="ltr"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines(
                        lines.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l)),
                      )
                    }
                    className={FIELD}
                  />
                </div>
                <div className="min-w-40 flex-1">
                  <Label htmlFor={`line-desc-${line.key}`}>{t('itemDescription')}</Label>
                  <input
                    id={`line-desc-${line.key}`}
                    value={line.description}
                    onChange={(e) =>
                      setLines(
                        lines.map((l) => (l.key === line.key ? { ...l, description: e.target.value } : l)),
                      )
                    }
                    className={FIELD}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                >
                  {t('setupRemove')}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const first = items[0];
                setLines([
                  ...lines,
                  { key: rowKey(), itemId: first?.id ?? '', quantity: '1', description: '' },
                ]);
              }}
            >
              {t('orderAddLine')}
            </Button>
          </fieldset>

          {error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger">
              <IconAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.push(`/${locale}/production/orders`);
                router.refresh();
              }}
              className="w-full sm:w-auto"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={working}
              onClick={(e) => void onSubmit(e, 'save')}
              className="w-full sm:w-auto"
            >
              {working
                ? t('formSaving')
                : id
                  ? t('formSave')
                  : t('formCreate')}
            </Button>
            <Button
              type="submit"
              variant="secondary"
              disabled={working || !id}
              onClick={(e) => void onSubmit(e, 'issue')}
              className="w-full sm:w-auto"
            >
              {working ? t('formIssuing') : t('formIssue')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}