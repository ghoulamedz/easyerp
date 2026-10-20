'use client';

/**
 * The actions a document offers, in one place.
 *
 * A list row and the document's own page show the same buttons, and they must
 * agree about when each one appears — that agreement is the whole point of this
 * component. Duplicating the conditionals is how a list ends up offering Edit on
 * an issued document while the detail page does not (or the reverse), and how the
 * "already issued" message ends up worded twice, differently.
 *
 * The rules, all of them derived from the status and the permissions the page
 * passes (ADR 0006, ADR 0011, ADR 0018):
 *
 * - **Issue** — a Draft, when the page carries an issue permission.
 * - **Cancel** — anything not already cancelled, when the page carries a cancel
 *   permission. Fiscal documents have no cancel route: they are corrected by a
 *   Credit Note, so their pages pass no cancel permission at all.
 * - **Edit** — a Draft, when the page names an edit base and the update permission.
 *   An issued document has no edit route that accepts it, so offering the button
 *   would only produce an error the reader cannot act on.
 * - **View** — when the caller names a detail screen (a list row: the document's
 *   own page does not link to itself).
 * - **Print** — always. A draft prints too, carrying its status word.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { DocumentType } from '@easyerp/contracts';
import { translatorFor, format, type Locale, type MessageKey } from '../i18n/config';
import { ApiError, apiSend } from '../lib/api';
import { localizeErrorMessage, currentLocale } from '../lib/error-messages';
import { useHasPermission } from '../lib/use-permissions';

const BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-sunken disabled:opacity-50';

/**
 * The per-type wording for "this was already issued".
 *
 * The server answers one CONFLICT message for every type, so the sentence a
 * reader sees has to be the one their own paper uses: an invoice says *facture*,
 * a delivery note says *bon de livraison*. The number travels in as `{number}`.
 */
const ALREADY_ISSUED_KEY: Record<DocumentType, MessageKey> = {
  SALES_ORDER: 'alreadyIssuedSalesOrder',
  DELIVERY_NOTE: 'alreadyIssuedDeliveryNote',
  CUSTOMER_INVOICE: 'alreadyIssuedCustomerInvoice',
  CREDIT_NOTE: 'alreadyIssuedCreditNote',
  PURCHASE_ORDER: 'alreadyIssuedPurchaseOrder',
  PRODUCTION_ORDER: 'alreadyIssuedProductionOrder',
  GOODS_RECEIPT: 'alreadyIssuedPurchaseOrder',
};

/** What a client shows when a transition fails, in the reader's language. */
function messageFor(error: unknown, locale: Locale, type: DocumentType, number: string | null): string {
  const t = translatorFor(locale);
  if (error instanceof ApiError) {
    if (error.code === 'CONFLICT' && /already issued/i.test(error.message)) {
      // The server writes "Type <id> is already issued as <number>. …"; only the
      // number is worth showing, inside the sentence this paper's type owns.
      const issued = /already issued as ([^.]+)/i.exec(error.message)?.[1]?.trim() ?? number ?? '—';
      return format(t(ALREADY_ISSUED_KEY[type]), { number: issued });
    }
    return localizeErrorMessage(error.code, error.message, locale);
  }
  return error instanceof Error ? error.message : String(error);
}

export interface DocumentActionsProps {
  locale: Locale;
  /** The document's API base, e.g. `/sales/orders`. */
  endpoint: string;
  id: string;
  type: DocumentType;
  status: string;
  number: string | null;
  /**
   * Where the print copy lives. Absolute because it is fetched as a document, not
   * navigated to by the Next router.
   */
  printHref: string;
  issuePermission?: string | undefined;
  cancelPermission?: string | undefined;
  editPermission?: string | undefined;
  /** `<editBaseHref>/<id>/edit`; absent when the type has no update endpoint. */
  editBaseHref?: string | undefined;
  /** The document's own screen; a list row links to it, the page does not. */
  detailHref?: string | undefined;
  /** Re-read after a transition landed, so the new status shows. */
  onChanged?: () => void;
}

export function DocumentActions(props: DocumentActionsProps) {
  const {
    locale,
    endpoint,
    id,
    type,
    status,
    number,
    printHref,
    issuePermission,
    cancelPermission,
    editPermission,
    editBaseHref,
    detailHref,
    onChanged,
  } = props;

  const t = translatorFor(locale);
  // Hooks run unconditionally: an absent prop can never match a permission.
  const canIssue = useHasPermission(issuePermission ?? '');
  const canCancel = useHasPermission(cancelPermission ?? '');
  const canEdit = useHasPermission(editPermission ?? '');

  const [pending, setPending] = useState<'issue' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showIssue = issuePermission !== undefined && canIssue && status === 'DRAFT';
  const showCancel = cancelPermission !== undefined && canCancel && status !== 'CANCELLED';
  const showEdit = editPermission !== undefined && canEdit && editBaseHref !== undefined && status === 'DRAFT';
  const editHref = showEdit ? `${editBaseHref}/${id}/edit` : null;

  async function transition(action: 'issue' | 'cancel'): Promise<void> {
    setPending(action);
    setError(null);
    try {
      await apiSend(`${endpoint}/${id}/${action}`, 'POST');
      onChanged?.();
    } catch (cause) {
      setError(messageFor(cause, locale, type, number));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {showIssue ? (
          <button type="button" disabled={pending !== null} onClick={() => void transition('issue')} className={BUTTON}>
            {pending === 'issue' ? t('working') : t('docIssue')}
          </button>
        ) : null}
        {showCancel ? (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => void transition('cancel')}
            className={BUTTON}
          >
            {pending === 'cancel' ? t('working') : t('cancel')}
          </button>
        ) : null}
        {editHref !== null ? (
          <Link href={editHref} className={BUTTON}>
            {t('editButton')}
          </Link>
        ) : null}
        {detailHref !== undefined ? (
          <Link href={detailHref} className={BUTTON}>
            {t('viewButton')}
          </Link>
        ) : null}
        <a href={printHref} target="_blank" rel="noreferrer" className={BUTTON}>
          {t('printButton')}
        </a>
      </div>
      {error !== null ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The print copy's address for a document, from its API base. */
export function printHrefFor(endpoint: string, id: string): string {
  return `/api${endpoint}/${id}/print`;
}

/** Keeps `currentLocale` reachable for callers that pre-localize a message. */
export { currentLocale };
