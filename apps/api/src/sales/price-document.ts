/**
 * Document pricing (ADR 0005): resolve Items and price them, once, for every
 * Document type that carries price — Customer Invoice and Sales Order today.
 *
 * A Draft stores real figures, and issuing re-prices from the Item rows again
 * inside the issuing transaction, so a price changed between drafting and
 * issuing is reflected on the document the client actually receives.
 *
 * The Item's own rate is used even if the Tax Rate row has since expired: the
 * document must reflect the Item's price and rate, and substituting a "current"
 * rate would change the tax on a document nobody edited. Correcting a rate is a
 * deliberate act on the Item, and it applies to the next document.
 */

import { type DocumentTaxGroup, type OrderLineInput, money, rate } from '@easyerp/contracts';

import { priceLine, sumLines } from '../finance/pricing.js';
import { validationFailed } from '../common/errors.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Structural subset of Prisma, so a Draft (PrismaService) and an issue
 * (transaction client) can both price through the same function.
 */
export type ItemReader = Pick<PrismaService, 'item'>;

/** The priced result for one requested line. Every figure here is server-resolved. */
export interface DocumentPricedLine {
  readonly itemId: string;
  readonly itemType: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitOfMeasureId: string;
  readonly unitPrice: string;
  readonly taxRate: string;
  readonly netAmount: string;
  readonly taxAmount: string;
  readonly grossAmount: string;
}

/** Resolve Items and price them. The single place money enters the flow. */
export async function priceItems(
  prisma: ItemReader,
  requested: readonly OrderLineInput[],
): Promise<DocumentPricedLine[]> {
  const ids = [...new Set(requested.map((line) => line.itemId))];
  const items = await prisma.item.findMany({
    where: { id: { in: ids }, isActive: true },
    include: { taxRate: true },
  });
  const byId = new Map(items.map((item) => [item.id, item]));

  return requested.map((line) => {
    const item = byId.get(line.itemId);
    if (!item) {
      throw validationFailed(
        `Item ${line.itemId} is missing or deactivated. A deactivated Item cannot be priced, ` +
          'but documents that already quote it keep its stored description.',
        { itemId: line.itemId },
      );
    }

    const unitPrice = item.salePrice.toString();
    const taxRate = item.taxRate.rate.toString();
    const priced = priceLine({ quantity: line.quantity, unitPrice, taxRate });

    return {
      itemId: item.id,
      itemType: item.itemType,
      description: line.description ?? item.description ?? item.name,
      quantity: line.quantity,
      unitOfMeasureId: item.saleUnitId ?? item.baseUnitId,
      unitPrice,
      taxRate,
      netAmount: priced.net.toString(),
      taxAmount: priced.tax.toString(),
      grossAmount: priced.gross.toString(),
    };
  });
}

/** Totals for a set of priced lines, reusing the one aggregation the renderer uses. */
export function totalsOf(priced: readonly DocumentPricedLine[]): {
  netAmount: string;
  taxAmount: string;
  grossAmount: string;
  taxGroups: DocumentTaxGroup[];
} {
  const totals = sumLines(
    priced.map((line) => ({
      ...priceLine({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
      }),
      taxRate: line.taxRate,
    })),
  );

  return {
    netAmount: totals.net.toString(),
    taxAmount: totals.tax.toString(),
    grossAmount: totals.gross.toString(),
    taxGroups: totals.taxByRate.map((group): DocumentTaxGroup => ({
      rate: rate(group.rate),
      base: money(group.base.toString()),
      amount: money(group.amount.toString()),
    })),
  };
}

/** Re-aggregate the lines of an issuing transaction, without Item re-resolution. */
export function repriceTotals(
  priced: readonly Pick<DocumentPricedLine, 'quantity' | 'unitPrice' | 'taxRate'>[],
) {
  return sumLines(
    priced.map((line) => ({
      ...priceLine({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
      }),
      taxRate: line.taxRate,
    })),
  );
}
