import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canTransition,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  documentStatusSchema,
  documentTypeSchema,
  isEditable,
  isFiscal,
  isNumbered,
  numberPatternSchema,
  orderLineInputSchema,
  renderDocumentNumber,
} from './documents.js';

describe('document states', () => {
  it('never lets an Issued document go back to Draft', () => {
    for (const type of DOCUMENT_TYPES) {
      for (const from of DOCUMENT_STATUSES) {
        for (const to of DOCUMENT_STATUSES) {
          if (from === 'ISSUED' && to === 'DRAFT') {
            expect(canTransition(type, from, to), `${type} ${from}->${to}`).toBe(false);
          }
        }
      }
    }
  });

  it('never lets an Issued document be cancelled once it is a fiscal document', () => {
    expect(canTransition('CUSTOMER_INVOICE', 'ISSUED', 'CANCELLED')).toBe(false);
    expect(canTransition('CREDIT_NOTE', 'ISSUED', 'CANCELLED')).toBe(false);
  });

  it('cancels an issued order instead, which is the only way to release a Reservation', () => {
    expect(canTransition('SALES_ORDER', 'ISSUED', 'CANCELLED')).toBe(true);
    expect(canTransition('PURCHASE_ORDER', 'ISSUED', 'CANCELLED')).toBe(true);
  });

  it('issues every type from Draft and nothing else', () => {
    for (const type of DOCUMENT_TYPES) {
      expect(canTransition(type, 'DRAFT', 'ISSUED'), type).toBe(true);
      expect(canTransition(type, 'ISSUED', 'DRAFT'), type).toBe(false);
    }
  });

  it('edits and numbers a Document according to its state', () => {
    expect(isEditable('DRAFT')).toBe(true);
    expect(isEditable('ISSUED')).toBe(false);
    expect(isEditable('CANCELLED')).toBe(false);
    expect(isNumbered('DRAFT')).toBe(false);
    expect(isNumbered('ISSUED')).toBe(true);
  });

  it('knows which types carry fiscal weight', () => {
    expect(isFiscal('CUSTOMER_INVOICE')).toBe(true);
    expect(isFiscal('CREDIT_NOTE')).toBe(true);
    expect(isFiscal('SALES_ORDER')).toBe(false);
  });

  it('reports the reachable states for a dropdown', () => {
    expect(allowedTransitions('CUSTOMER_INVOICE', 'ISSUED')).toEqual([]);
    expect(allowedTransitions('SALES_ORDER', 'DRAFT')).toEqual(['ISSUED', 'CANCELLED']);
  });

  it('validates enum members', () => {
    expect(documentTypeSchema.safeParse('CUSTOMER_INVOICE').success).toBe(true);
    expect(documentTypeSchema.safeParse('QUOTE').success).toBe(false);
    expect(documentStatusSchema.safeParse('ISSUED').success).toBe(true);
  });
});

describe('document numbering', () => {
  it('requires exactly one sequence token', () => {
    expect(numberPatternSchema.safeParse('FA-{year}-{seq}').success).toBe(true);
    expect(numberPatternSchema.safeParse('FA-{seq}').success).toBe(true);
    expect(numberPatternSchema.safeParse('FA-{seq}-{seq}').success).toBe(false);
    expect(numberPatternSchema.safeParse('FA-2026').success).toBe(false);
  });

  it('rejects a pattern that would let a client inject markup into a PDF', () => {
    expect(numberPatternSchema.safeParse('FA-{seq}<script>').success).toBe(false);
    expect(numberPatternSchema.safeParse('FA {seq}').success).toBe(false);
  });

  it('renders the year and the zero-padded sequence', () => {
    expect(renderDocumentNumber('FA-{year}-{seq}', { sequence: 1, year: 2026 })).toBe('FA-2026-1');
    expect(renderDocumentNumber('FA-{year}-{seq}', { sequence: 42, year: 2026 })).toBe(
      'FA-2026-42',
    );
    expect(renderDocumentNumber('FA-{seq}', { sequence: 7, year: 2026 })).toBe('FA-7');
  });

  it('never pads below the natural width of the sequence, so 1000 does not collide with 1000-1', () => {
    const thousandth = renderDocumentNumber('FA-{seq}', { sequence: 1000, year: 2026 });
    const next = renderDocumentNumber('FA-{seq}', { sequence: 1001, year: 2026 });
    expect(thousandth).toBe('FA-1000');
    expect(next).toBe('FA-1001');
  });

  it('refuses a sequence that is not a positive integer, because that would break the series', () => {
    for (const invalid of [0, -1, 1.5, Number.NaN]) {
      expect(() => renderDocumentNumber('FA-{seq}', { sequence: invalid, year: 2026 })).toThrow(
        RangeError,
      );
    }
  });
});

describe('order line input', () => {
  const valid = { itemId: 'item_1', quantity: '2.5' };

  it('carries the Item and the quantity and nothing financial', () => {
    expect(orderLineInputSchema.parse(valid)).toEqual(valid);
    expect(Object.keys(orderLineInputSchema.shape).sort()).toEqual([
      'description',
      'itemId',
      'quantity',
      'unitOfMeasureId',
    ]);
  });

  it('rejects a client that tries to submit its own price or tax rate', () => {
    const forged = { ...valid, unitPrice: '1.000', taxRate: '0', netAmount: '0.000' };
    expect(orderLineInputSchema.safeParse(forged).success).toBe(false);
  });

  it('rejects a zero or negative quantity', () => {
    expect(orderLineInputSchema.safeParse({ ...valid, quantity: '0' }).success).toBe(false);
    expect(orderLineInputSchema.safeParse({ ...valid, quantity: '-1' }).success).toBe(false);
  });
});
