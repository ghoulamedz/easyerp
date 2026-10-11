import { describe, expect, it } from 'vitest';
import {
  DIRECTION_BY_REASON,
  directionOf,
  reversedDirection,
  stockPositionListItemSchema,
  STOCK_LEDGER_REASONS,
} from './stock.js';

describe('stock ledger directions', () => {
  it('derives the direction from the reason, for every reason but a Reversal', () => {
    for (const reason of STOCK_LEDGER_REASONS) {
      if (reason === 'REVERSAL') continue;
      const direction = DIRECTION_BY_REASON[reason];
      expect(['IN', 'OUT']).toContain(direction);
      expect(directionOf(reason)).toBe(direction);
    }
  });

  it('makes a Reversal undo the entry it reverses, whichever way that ran', () => {
    expect(directionOf('REVERSAL', 'IN')).toBe('OUT');
    expect(directionOf('REVERSAL', 'OUT')).toBe('IN');
  });

  it('reverses a direction only to its opposite', () => {
    expect(reversedDirection('IN')).toBe('OUT');
    expect(reversedDirection('OUT')).toBe('IN');
  });
});
describe('stock positions', () => {
  it('lets Available go negative under a backorder, and not On-hand', () => {
    const position = {
      itemId: 'item_1',
      code: 'C-1',
      name: 'Casque',
      onHand: '30.000',
      reserved: '100.000',
      reorderPoint: '10.000',
      atOrBelowReorder: false,
    };
    // An ALLOW backorder promises 100 and holds 30: available is −70, and hiding
    // that behind a zero is exactly the legacy overselling bug the ledger exists to
    // make visible (ADR 0004).
    expect(stockPositionListItemSchema.parse({ ...position, available: '-70.000' }).available).toBe(
      '-70.000',
    );
    expect(stockPositionListItemSchema.safeParse({ ...position, onHand: '-1.000' }).success).toBe(
      false,
    );
  });
});
