'use client';

/**
 * Item form — unified for create and edit.
 *
 * Create (no `id`): POST /items → new item with initial quantity, then Save stays,
 * Issue redirects to the list. Edit (`id` provided): PATCH /items/:id,
 * then Save stays. The initial quantity field is editable only on create;
 * on edit it is disabled (stock adjustments only from Stock screen).
 *
 * Money travels as decimal strings and the server resolves every price and tax
 * rate (ADR 0005): the client sends amounts, never computed totals. Units and
 * tax rates come from Settings lists, so an Item can only reference rows that
 * exist.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Item, StockLedgerEntry, TaxRateRecord, UnitRecord } from '@easyerp/contracts';
import { ITEM_TYPES } from '@easyerp/contracts';
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

export function ItemUnifiedForm({
  locale,
  id,
}: {
  locale: Locale;
  id?: string;
}) {
  const t = translatorFor(locale);
  const router = useRouter();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [itemType, setItemType] = useState<string>(ITEM_TYPES[2]);
  const [baseUnitId, setBaseUnitId] = useState('');
  const [saleUnitId, setSaleUnitId] = useState('');
  const [taxRateId, setTaxRateId] = useState('');
  const [salePrice, setSalePrice] = useState('0');
  const [purchasePrice, setPurchasePrice] = useState('0');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [reorderPoint, setReorderPoint] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [fodecSubject, setFodecSubject] = useState(false);

  const [units, setUnits] = useState<readonly UnitRecord[]>([]);
  const [rates, setRates] = useState<readonly TaxRateRecord[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  // Initialised from the prop: an edit has something to load, a create does not.
  // Setting this from inside the effect would be a synchronous setState in an
  // effect body — a cascading render for a value that is known before it runs.
  const [loadingItem, setLoadingItem] = useState(Boolean(id));
  /** The Item's current on-hand, read from its ledger entries (ADR 0004). */
  const [onHand, setOnHand] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(id);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiGet<unknown>('/settings/units'),
      apiGet<unknown>('/settings/tax-rates'),
      id ? apiGet<Item>(`/items/${id}`) : Promise.resolve(null),
    ])
      .then(async ([u, r, item]) => {
        if (cancelled) return;
        const unitList = asArray<UnitRecord>(u);
        const rateList = asArray<TaxRateRecord>(r);
        setUnits(unitList);
        setRates(rateList);
        if (unitList.length > 0) setBaseUnitId(unitList[0]?.id ?? '');

        if (item) {
          setCode(item.code);
          setName(item.name);
          setDescription(item.description ?? '');
          setItemType(item.itemType);
          setBaseUnitId(item.baseUnitId);
          setSaleUnitId(item.saleUnitId ?? '');
          setTaxRateId(item.taxRateId);
          setSalePrice(item.salePrice);
          setPurchasePrice(item.purchasePrice);
          setReorderPoint(item.reorderPoint ?? '');
          setIsActive(item.isActive);
          setFodecSubject(item.fodecSubject);
        } else {
          if (rateList.length > 0) setTaxRateId(rateList[0]?.id ?? '');
        }

        // On an edit the quantity is a fact about the ledger, not a field to set:
        // the last entry's balance is what the Item holds, and the stock screen is
        // where it moves. Reading it here means the box is not a mystery zero.
        if (id && item) {
          const entries = await apiGet<readonly StockLedgerEntry[]>(
            `/inventory/stock/entries/${id}`,
          ).catch(() => [] as readonly StockLedgerEntry[]);
          if (cancelled) return;
          setOnHand(entries.at(-1)?.balanceAfter ?? '0');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('loadFailed'));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingRefs(false);
          setLoadingItem(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, locale]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() === '' ? null : description.trim(),
        itemType,
        baseUnitId,
        purchaseUnitId: null,
        saleUnitId: saleUnitId === '' ? null : saleUnitId,
        taxRateId,
        salePrice: salePrice.trim(),
        purchasePrice: purchasePrice.trim(),
        reorderPoint: reorderPoint.trim() === '' ? null : reorderPoint.trim(),
        isActive,
        fodecSubject,
      };

      if (isEdit) {
        // No initial quantity on an edit: the schema is strict and refuses it, and
        // stock moves through the ledger (ADR 0004).
        await apiSend(`/items/${id}`, 'PATCH', payload);
      } else {
        await apiSend('/items', 'POST', {
          ...payload,
          initialQuantity: initialQuantity.trim() === '' ? '0' : initialQuantity.trim(),
        });
      }

      router.push(`/${locale}/items`);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('loadFailed'));
      // Re-enable only when the write failed. On success the screen is leaving,
      // and clearing the flag while Next navigates is what made the button
      // clickable again mid-navigation — a second click then posts twice.
      setWorking(false);
    }
  };

  if (loadingRefs || loadingItem) {
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
              <Label htmlFor="item-code">{t('itemCode')}</Label>
              <input
                id="item-code"
                required
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="item-name">{t('itemName')}</Label>
              <input
                id="item-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="item-desc">{t('itemDescription')}</Label>
              <input
                id="item-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="item-type">{t('itemTypeLabel')}</Label>
              <select
                id="item-type"
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
                className={FIELD}
              >
                {ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="item-tax">{t('itemTaxRate')}</Label>
              <select
                id="item-tax"
                required
                value={taxRateId}
                onChange={(e) => setTaxRateId(e.target.value)}
                className={FIELD}
              >
                {rates.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.code} — {rate.rate}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="item-base-unit">{t('itemBaseUnit')}</Label>
              <select
                id="item-base-unit"
                required
                value={baseUnitId}
                onChange={(e) => setBaseUnitId(e.target.value)}
                className={FIELD}
              >
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="item-sale-unit">{t('itemSaleUnit')}</Label>
              <select
                id="item-sale-unit"
                value={saleUnitId}
                onChange={(e) => setSaleUnitId(e.target.value)}
                className={FIELD}
              >
                <option value="">{t('itemNone')}</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="item-sale-price">{t('itemSalePrice')}</Label>
              <input
                id="item-sale-price"
                required
                dir="ltr"
                inputMode="decimal"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="item-buy-price">{t('itemPurchasePrice')}</Label>
              <input
                id="item-buy-price"
                required
                dir="ltr"
                inputMode="decimal"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <Label htmlFor="item-initial-quantity">
                {isEdit ? t('itemOnHand') : t('itemInitialQuantity')}
              </Label>
              <input
                id="item-initial-quantity"
                dir="ltr"
                inputMode="decimal"
                value={isEdit ? (onHand ?? '…') : initialQuantity}
                onChange={isEdit ? undefined : (e) => setInitialQuantity(e.target.value)}
                disabled={isEdit}
                className={FIELD}
              />
              {isEdit ? (
                <p className="mt-1 text-xs text-ink-subtle">{t('itemOnHandHint')}</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="item-reorder">{t('itemReorderPoint')}</Label>
              <input
                id="item-reorder"
                dir="ltr"
                inputMode="decimal"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
                className={FIELD}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={fodecSubject}
                  onChange={(e) => setFodecSubject(e.target.checked)}
                />
                {t('itemFodec')}
              </label>
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

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                router.push(`/${locale}/items`);
                router.refresh();
              }}
              className="w-full"
            >
              {t('cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={working} className="w-full">
              {working
                ? t('formSaving')
                : isEdit
                  ? t('formSave')
                  : t('formCreate')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}