import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canTransition,
  creditNoteSchema,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  documentStatusSchema,
  documentTotalsSchema,
  documentTypeSchema,
  draftCreditNoteSchema,
  draftSalesOrderSchema,
  isEditable,
  isFiscal,
  isNumbered,
  numberPatternSchema,
  orderLineInputSchema,
  orderLineSchema,
  renderDocumentNumber,
  salesOrderSchema,
  salesOrderUpdateSchema,
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
    expect(renderDocumentNumber('FA-{year}-{seq}', { sequence: 1, year: 2026, padding: 4 })).toBe(
      'FA-2026-0001',
    );
    expect(renderDocumentNumber('FA-{year}-{seq}', { sequence: 42, year: 2026, padding: 4 })).toBe(
      'FA-2026-0042',
    );
    expect(renderDocumentNumber('FA-{seq}', { sequence: 7, year: 2026, padding: 4 })).toBe(
      'FA-0007',
    );
  });

  it('pads to the padding stored on the pattern, not to a fixed width', () => {
    // The same pattern at two paddings, because an Administrator edits padding in
    // Settings and the rendered number has to follow it.
    expect(renderDocumentNumber('FA-{seq}', { sequence: 7, year: 2026, padding: 2 })).toBe('FA-07');
    expect(renderDocumentNumber('FA-{seq}', { sequence: 7, year: 2026, padding: 6 })).toBe(
      'FA-000007',
    );
  });

  it('never pads below the natural width of the sequence, so 1000 does not collide with 1000-1', () => {
    const thousandth = renderDocumentNumber('FA-{seq}', { sequence: 1000, year: 2026, padding: 4 });
    const next = renderDocumentNumber('FA-{seq}', { sequence: 1001, year: 2026, padding: 4 });
    expect(thousandth).toBe('FA-1000');
    expect(next).toBe('FA-1001');
  });

  it('refuses a sequence that is not a positive integer, because that would break the series', () => {
    for (const invalid of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        renderDocumentNumber('FA-{seq}', { sequence: invalid, year: 2026, padding: 4 }),
      ).toThrow(RangeError);
    }
  });

  it('refuses a padding that is not a whole number of digits, rather than silently rendering unpadded', () => {
    for (const invalid of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        renderDocumentNumber('FA-{seq}', { sequence: 1, year: 2026, padding: invalid }),
      ).toThrow(RangeError);
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

describe('priced line and totals', () => {
  const line = {
    id: 'line_1',
    itemId: 'item_1',
    quantity: '2',
    unitPrice: '150.000',
    taxRate: '19',
    netAmount: '300.000',
    fodecAmount: '3.000',
    taxAmount: '57.570',
    grossAmount: '360.570',
  };

  it('carries the FODEC figure on every priced line', () => {
    expect(orderLineSchema.parse(line).fodecAmount).toBe('3.000');
  });

  it('rejects a priced line without its FODEC figure, so a client cannot drop it', () => {
    // Omit-by-rest: the binding exists only to drop the key.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fodecAmount: _dropped, ...withoutFodec } = line;
    expect(orderLineSchema.safeParse(withoutFodec).success).toBe(false);
  });

  it('carries the summed FODEC figure on the totals, never recomputed downstream', () => {
    const totals = {
      netAmount: '300.000',
      fodecAmount: '3.000',
      taxAmount: '57.570',
      grossAmount: '360.570',
      withholdingTaxAmount: '0.000',
      stampDutyAmount: '0.000',
    };
    expect(documentTotalsSchema.parse(totals).fodecAmount).toBe('3.000');
    // Omit-by-rest: the binding exists only to drop the key.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fodecAmount: _dropped, ...withoutFodec } = totals;
    expect(documentTotalsSchema.safeParse(withoutFodec).success).toBe(false);
  });
});

describe('Sales Order drafts', () => {
  const valid = {
    businessId: 'biz_1',
    partyId: 'cust_1',
    lines: [{ itemId: 'item_1', quantity: '2' }],
  };

  it('carries only the fields a Draft needs: no price, no locale, no totals', () => {
    expect(draftSalesOrderSchema.parse(valid)).toEqual(valid);
    expect(Object.keys(draftSalesOrderSchema.shape).sort()).toEqual([
      'businessId',
      'lines',
      'partyId',
    ]);
  });

  it('rejects a client that tries to price an order', () => {
    const forged = {
      ...valid,
      lines: [{ itemId: 'item_1', quantity: '2', unitPrice: '9.990' }],
    };
    expect(draftSalesOrderSchema.safeParse(forged).success).toBe(false);
  });

  it('rejects an order draft with no lines', () => {
    expect(draftSalesOrderSchema.safeParse({ ...valid, lines: [] }).success).toBe(false);
  });

  it('turns an empty update into an error, and a full one into a replace', () => {
    expect(salesOrderUpdateSchema.safeParse({}).success).toBe(false);
    expect(salesOrderUpdateSchema.safeParse({ partyId: 'cust_2' }).success).toBe(true);
    expect(
      salesOrderUpdateSchema.safeParse({ lines: [{ itemId: 'item_1', quantity: '1' }] }).success,
    ).toBe(true);
  });
});

describe('Sales Order responses', () => {
  const order = {
    id: 'doc_1',
    type: 'SALES_ORDER',
    status: 'ISSUED',
    number: 'BC-2026-0001',
    partyId: 'cust_1',
    issuedAt: '2026-10-06T00:00:00.000Z',
    totals: {
      netAmount: '300.000',
      fodecAmount: '0.000',
      taxAmount: '57.000',
      grossAmount: '357.000',
      withholdingTaxAmount: '0.000',
      stampDutyAmount: '0.000',
    },
    businessId: 'biz_1',
    party: {
      id: 'cust_1',
      code: 'C-1',
      name: 'Atlas Trading',
      taxIdentifier: '9876543/B/M/000',
      address: null,
      city: null,
      countryCode: null,
    },
    lines: [
      {
        id: 'line_1',
        itemId: 'item_1',
        unitOfMeasureId: 'u_1',
        description: 'Cours de soutien',
        quantity: '2',
        unitPrice: '150.000',
        taxRate: '19',
        netAmount: '300.000',
        fodecAmount: '0.000',
        taxAmount: '57.000',
        grossAmount: '357.000',
        deliveredQuantity: '0.000',
      },
    ],
    taxGroups: [{ rate: '19.000', base: '300.000', amount: '57.000' }],
  };

  it('carries the server-resolved price and the delivery-additive in one line', () => {
    expect(salesOrderSchema.parse(order).lines[0]?.deliveredQuantity).toBe('0.000');
    expect(salesOrderSchema.parse(order).lines[0]?.unitPrice).toBe('150.000');
  });

  it('rejects an order response whose line lacks the delivered quantity', () => {
    const line = Object.fromEntries(
      Object.entries(order.lines[0]!).filter(([key]) => key !== 'deliveredQuantity'),
    );
    expect(salesOrderSchema.safeParse({ ...order, lines: [line] }).success).toBe(false);
  });
});

describe('credit note', () => {
  it('rejects a draft that tries to price its own correction', () => {
    const payload = {
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      lines: [{ invoiceLineId: 'il_1', quantity: '1', unitPrice: '150.000' }],
    };
    expect(draftCreditNoteSchema.safeParse(payload).success).toBe(false);
  });

  it('names the invoice line and a strictly positive quantity on each draft line', () => {
    expect(
      draftCreditNoteSchema.safeParse({
        businessId: 'biz_1',
        invoiceId: 'inv_1',
        lines: [{ invoiceLineId: 'il_1', quantity: '1' }],
      }).success,
    ).toBe(true);
    expect(
      draftCreditNoteSchema.safeParse({
        businessId: 'biz_1',
        invoiceId: 'inv_1',
        lines: [{ invoiceLineId: 'il_1', quantity: '0' }],
      }).success,
    ).toBe(false);
    expect(
      draftCreditNoteSchema.safeParse({
        businessId: 'biz_1',
        invoiceId: 'inv_1',
        lines: [{ invoiceLineId: 'il_1', quantity: '-1' }],
      }).success,
    ).toBe(false);
  });

  it('serves the line with a signed quantity and the reversed money', () => {
    const creditNote = {
      id: 'cn_1',
      type: 'CREDIT_NOTE',
      status: 'ISSUED',
      number: 'AV-2026-0001',
      partyId: 'cust_1',
      issuedAt: '2026-10-07T00:00:00.000Z',
      totals: {
        netAmount: '-330.000',
        fodecAmount: '0.000',
        taxAmount: '-62.700',
        grossAmount: '-392.700',
        withholdingTaxAmount: '0.000',
        stampDutyAmount: '0.000',
      },
      businessId: 'biz_1',
      party: {
        id: 'cust_1',
        code: 'C-1',
        name: 'Atlas Trading',
        taxIdentifier: '9876543/B/M/000',
        address: null,
        city: null,
        countryCode: null,
      },
      locale: 'fr',
      vatRegime: 'STANDARD',
      currency: 'TND',
      corrected: { documentId: 'inv_1', number: 'FA-2026-0001' },
      lines: [
        {
          itemId: 'item_1',
          unitOfMeasureId: 'u_1',
          description: 'Cours de soutien',
          quantity: '-2',
          unitPrice: '150.000',
          taxRate: '19',
          netAmount: '-300.000',
          taxAmount: '-57.000',
          grossAmount: '-357.000',
          correctsDocumentLineId: 'il_1',
        },
      ],
      taxGroups: [{ rate: '19', base: '-300.000', amount: '-57.000' }],
    };

    const parsed = creditNoteSchema.parse(creditNote);
    expect(parsed.lines[0]?.quantity).toBe('-2');
    expect(parsed.lines[0]?.grossAmount).toBe('-357.000');
    expect(parsed.corrected.number).toBe('FA-2026-0001');
  });

  it('rejects a response with a positive line quantity: a reversal is signed', () => {
    const creditNote = {
      id: 'cn_1',
      type: 'CREDIT_NOTE',
      status: 'DRAFT',
      number: null,
      partyId: 'cust_1',
      issuedAt: null,
      totals: {
        netAmount: '0.000',
        fodecAmount: '0.000',
        taxAmount: '0.000',
        grossAmount: '0.000',
        withholdingTaxAmount: '0.000',
        stampDutyAmount: '0.000',
      },
      businessId: 'biz_1',
      party: {
        id: 'cust_1',
        code: 'C-1',
        name: 'Atlas Trading',
        taxIdentifier: '9876543/B/M/000',
        address: null,
        city: null,
        countryCode: null,
      },
      locale: 'fr',
      vatRegime: 'STANDARD',
      currency: 'TND',
      corrected: { documentId: 'inv_1', number: 'FA-2026-0001' },
      lines: [
        {
          itemId: 'item_1',
          unitOfMeasureId: 'u_1',
          quantity: '2',
          unitPrice: '150.000',
          taxRate: '19',
          netAmount: '300.000',
          taxAmount: '57.000',
          grossAmount: '357.000',
          correctsDocumentLineId: 'il_1',
        },
      ],
      taxGroups: [],
    };
    expect(creditNoteSchema.safeParse(creditNote).success).toBe(false);
  });

  it('keeps the correction triangle quoted: it always names the Invoice it corrects', () => {
    const creditNote = {
      id: 'cn_1',
      type: 'CREDIT_NOTE',
      status: 'DRAFT',
      number: null,
      partyId: 'cust_1',
      issuedAt: null,
      totals: {
        netAmount: '0.000',
        fodecAmount: '0.000',
        taxAmount: '0.000',
        grossAmount: '0.000',
        withholdingTaxAmount: '0.000',
        stampDutyAmount: '0.000',
      },
      businessId: 'biz_1',
      party: {
        id: 'cust_1',
        code: 'C-1',
        name: 'Atlas Trading',
        taxIdentifier: '9876543/B/M/000',
        address: null,
        city: null,
        countryCode: null,
      },
      locale: 'fr',
      vatRegime: 'STANDARD',
      currency: 'TND',
      lines: [
        {
          itemId: 'item_1',
          unitOfMeasureId: 'u_1',
          quantity: '-2',
          unitPrice: '150.000',
          taxRate: '19',
          netAmount: '-300.000',
          taxAmount: '-57.000',
          grossAmount: '-357.000',
          correctsDocumentLineId: 'il_1',
        },
      ],
      taxGroups: [],
    };
    expect(creditNoteSchema.safeParse(creditNote).success).toBe(false);
  });
});
