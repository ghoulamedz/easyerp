'use client';

/**
 * The one detail view every paper's `[id]` page renders (ADR 0010).
 *
 * The page is a thin server wrapper; this component fetches the real document
 * through `lib/api` (never a placeholder), renders the stored fields verbatim,
 * and offers the paper's archived bytes two ways: Download (a blob fetched from
 * `GET <paper>/:id/pdf`) and Print (the same blob loaded into a hidden iframe
 * and handed to the browser's print dialog). Both run off the one `apiPdf`
 * helper, so an archive that is not attached to the deployment surfaces as the
 * localized `ARCHIVE_UNAVAILABLE` message instead of a dead link.
 */

import { useEffect, useRef, useState } from 'react';
import { IconAlert, IconDownload, IconPrinter } from './icons';
import { apiGet, apiPdf, ApiError } from '../lib/api';
import { Card, CardBody, CardHeader } from './ui';

/** The fields every paper response shares (from `@easyerp/contracts`). */
interface PaperDocument {
  readonly id: string;
  readonly number: string | null;
  readonly status: string;
  readonly issuedAt: string | null;
  readonly party?: { readonly name: string } | null;
  readonly totals?: {
    readonly netAmount: string;
    readonly taxAmount: string;
    readonly grossAmount: string;
  } | null;
  readonly lines: readonly {
    readonly description?: string | null;
    readonly itemId: string;
    readonly quantity: string;
    readonly unitPrice?: string;
    readonly netAmount?: string;
    readonly taxAmount?: string;
    readonly grossAmount?: string;
  }[];
}

export interface PaperDetailLabels {
  /** Already-translated strings, built on the server page from the i18n table. */
  readonly details: string;
  readonly number: string;
  readonly status: string;
  readonly date: string;
  readonly party: string;
  readonly lines: string;
  readonly item: string;
  readonly quantity: string;
  readonly net: string;
  readonly tax: string;
  readonly gross: string;
  readonly print: string;
  readonly download: string;
  readonly loading: string;
  readonly archiveHint: string;
  /** The three statuses of a Document, already translated. */
  readonly statusDraft: string;
  readonly statusIssued: string;
  readonly statusCancelled: string;
}

export function statusText(status: string, labels: PaperDetailLabels): string {
  switch (status) {
    case 'DRAFT':
      return labels.statusDraft;
    case 'ISSUED':
      return labels.statusIssued;
    case 'CANCELLED':
      return labels.statusCancelled;
    default:
      return status;
  }
}

export function DocumentPaperDetail({
  paper,
  id,
  labels,
}: {
  /** The paper's API base, e.g. `/sales/orders` — the source of both reads. */
  paper: string;
  id: string;
  labels: PaperDetailLabels;
}) {
  const [document, setDocument] = useState<PaperDocument | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const printFrame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<PaperDocument>(`${paper}/${id}`)
      .then((doc) => {
        if (!cancelled) {
          setDocument(doc);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof ApiError ? cause : new ApiError(500, 'REQUEST_FAILED', String(cause)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [paper, id]);

  /** Fetch the archived PDF once; the caller decides how to hand it over. */
  async function archivedPdf(): Promise<Blob> {
    setBusy(true);
    try {
      return await apiPdf(`${paper}/${id}/pdf`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError(500, 'REQUEST_FAILED', String(cause)));
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  async function download(): Promise<void> {
    let blob: Blob;
    try {
      blob = await archivedPdf();
    } catch {
      // `archivedPdf` recorded the failure for rendering.
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${document?.number ?? id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function print(): Promise<void> {
    let blob: Blob;
    try {
      blob = await archivedPdf();
    } catch {
      // `archivedPdf` recorded the failure for rendering.
      return;
    }
    const url = URL.createObjectURL(blob);
    // One hidden iframe for every paper: the browser prints whatever it loads.
    let frame = printFrame.current;
    if (!frame) {
      frame = window.document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.setAttribute('aria-hidden', 'true');
      window.document.body.appendChild(frame);
      printFrame.current = frame;
    }
    frame.src = url;
    frame.onload = () => {
      URL.revokeObjectURL(url);
      frame?.contentWindow?.focus();
      frame?.contentWindow?.print();
    };
  }

  // Do not leak the print frame past the view's lifetime.
  useEffect(
    () => () => {
      printFrame.current?.remove();
      printFrame.current = null;
    },
    [],
  );

  if (error) {
    return (
      <div data-testid="paper-error">
        <Card>
          <CardBody>
            <p className="flex items-center gap-2 text-sm text-danger">
              <IconAlert className="size-4" /> {error.message}
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!document) {
    return (
      <div data-testid="paper-loading">
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">{labels.loading}</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const priced = document.lines.some((line) => line.unitPrice !== undefined);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={labels.details} />
        <CardBody>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-ink-subtle">{labels.number}</p>
                <p className="font-medium">{document.number ?? document.id}</p>
              </div>
              {document.party ? (
                <div>
                  <p className="text-xs text-ink-subtle">{labels.party}</p>
                  <p className="font-medium">{document.party.name}</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs text-ink-subtle">{labels.status}</p>
                <p className="font-medium">{statusText(document.status, labels)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-subtle">{labels.date}</p>
                <p className="font-medium">{document.issuedAt?.slice(0, 10) ?? '—'}</p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={labels.lines} />
        <CardBody>
          <div className="space-y-2">
            {document.lines.map((line) => (
              <div key={line.itemId + line.description} className="grid grid-cols-12 gap-2 text-xs">
                <div className="col-span-6">{line.description ?? line.itemId}</div>
                <div className="col-span-3">
                  <span className="inline-flex items-center rounded-md bg-surface-sunken px-2 py-0.5">
                    {line.quantity}
                  </span>
                </div>
                {priced ? (
                  <div className="col-span-3 text-right">{line.grossAmount ?? '—'}</div>
                ) : null}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {document.totals ? (
        <Card>
          <CardHeader title={labels.gross} />
          <CardBody>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-subtle">{labels.net}</span>
                <span>{document.totals.netAmount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-subtle">{labels.tax}</span>
                <span>{document.totals.taxAmount}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-ink-subtle">{labels.gross}</span>
                <span>{document.totals.grossAmount}</span>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={labels.archiveHint} />
        <CardBody>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void print()}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-sunken disabled:opacity-50"
            >
              <IconPrinter className="size-4" />
              {labels.print}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void download()}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:bg-surface-sunken disabled:opacity-50"
            >
              <IconDownload className="size-4" />
              {labels.download}
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
