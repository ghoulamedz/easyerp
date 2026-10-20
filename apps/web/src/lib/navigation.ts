/**
 * Where "back" goes.
 *
 * Not `router.back()`. History is whatever the visitor happened to do: from a search
 * result, a bookmark, or a shared link, "back" would leave the app or land somewhere
 * unrelated to where they are. A screen's parent is a fact about the app's structure,
 * so it is derived from the path — the same answer however the visitor arrived.
 *
 * The rule is "walk up until you reach a screen that lists things", using the list of
 * real list routes below. `/purchasing/receipts/<id>` goes to `/purchasing/receipts`,
 * and `/purchasing/orders/<id>/edit` goes to `/purchasing`, because there is no
 * `/purchasing/orders` page — a distinction no amount of segment-counting gets right.
 *
 * Pure and synchronous, so `navigation.test.ts` can check every route the app actually
 * serves: it walks the app directory and fails if any screen's parent is not a real
 * page. A route added without a parent fails there instead of stranding a visitor.
 */

/** The screens that list things, which is what a back control lands on. */
export const LIST_ROUTES: readonly string[] = [
  '/boms',
  '/credit-notes',
  '/customer-invoices',
  '/dashboard',
  '/delivery-notes',
  '/items',
  '/parties',
  '/payments',
  '/permissions',
  '/production',
  '/purchasing',
  '/purchasing/receipts',
  '/sales-orders',
  '/settings',
  '/settings/labels',
  '/settings/modules',
  '/settings/number-patterns',
  '/settings/roles',
  '/settings/tax-rates',
  '/settings/units',
  '/settings/users',
  '/stock',
];

/**
 * A route whose screen is a list of another section's documents.
 *
 * `/invoices/<id>` is a Customer Invoice: the paper lives there, but the list that
 * creates and edits it is `/customer-invoices`.
 */
const ALIASES: Readonly<Record<string, string>> = {
  invoices: 'customer-invoices',
};

/** The locale segment of a pathname, or `null` when there is none. */
function localeOf(segment: string | undefined): string | null {
  return segment === 'fr' || segment === 'en' || segment === 'ar' ? segment : null;
}

/**
 * The parent of a screen, as a path. Always a route the app serves, so "back" never
 * lands on a 404.
 */
export function parentOf(pathname: string): string {
  const segments = pathname.split('/').filter((part) => part !== '');
  const locale = localeOf(segments[0]);
  const rest = segments.slice(1);

  // Without a locale there is no path to reason about; the dashboard is the root the
  // middleware would have sent the visitor to anyway.
  if (locale === null) return '/fr/dashboard';

  const first = rest[0];
  const aliased =
    first !== undefined && ALIASES[first] !== undefined
      ? [ALIASES[first] as string, ...rest.slice(1)]
      : rest;

  // Walk up one segment at a time and stop at the first real list screen. The screen
  // itself is never its own parent, so the walk starts one level above it.
  for (let depth = aliased.length - 1; depth > 0; depth -= 1) {
    const candidate = `/${aliased.slice(0, depth).join('/')}`;
    if (LIST_ROUTES.includes(candidate)) return `/${locale}${candidate}`;
  }

  return `/${locale}/dashboard`;
}

/** The label a back control shows, in the reader's language. */
export function backLabel(locale: string): string {
  if (locale === 'ar') return 'رجوع';
  if (locale === 'en') return 'Back';
  return 'Retour';
}
