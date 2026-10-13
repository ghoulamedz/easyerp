'use client';

/**
 * New Item form.
 *
 * Money travels as decimal strings and the server resolves every price and tax
 * rate (ADR 0005): the client sends amounts, never computed totals. Units and
 * tax rates come from Settings lists, so an Item can only reference rows that
 * exist.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { TaxRateRecord, UnitRecord } from '@easyerp/contracts';
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

export function ItemForm({ locale }: { locale: Locale }) {
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
  const [reorderPoint, setReorderPoint] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [fodecSubject, setFodecSubject] = useState(false);

  const [units, setUnits] = useState<readonly UnitRecord[]>([]);
  const [rates, setRates] = useState<readonly TaxRateRecord[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiGet<unknown>('/settings/units'), apiGet<unknown>('/settings/tax-rates')])
      .then(([u, r]) => {
        if (cancelled) return;
        const unitList = asArray<UnitRecord>(u);
        const rateList = asArray<TaxRateRecord>(r);
        setUnits(unitList);
        setRates(rateList);
        if (unitList.length > 0) setBaseUnitId(unitList[0]?.id ?? '');
        if (rateList.length > 0) setTaxRateId(rateList[0]?.id ?? '');
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

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      await apiSend('/items', 'POST', {
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
      });
      router.push(`/${locale}/items`);
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

          <Button type="submit" variant="primary" disabled={working} className="w-full">
            {working ? t('formCreating') : t('formCreate')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
