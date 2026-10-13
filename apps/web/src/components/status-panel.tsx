'use client';

/**
 * Live service status.
 *
 * Same-origin requests to `/api/health` and `/api/ready`, which Next proxies to
 * the API in development and Caddy proxies in production. Going through the
 * browser's own origin means no CORS, and the same code works in both places.
 *
 * `/ready` is the one that matters: it only answers 200 once the database has
 * answered, so "the API is up" and "you can actually work" are not the same
 * claim.
 */

import { useCallback, useEffect, useState } from 'react';
import { IconAlert, IconCheck, IconDatabase, IconServer } from './icons';
import { Badge, Card, CardBody, CardHeader, StatusDot, type Tone } from './ui';
import { translatorFor, type Locale } from '../i18n/config';

type State = 'checking' | 'ok' | 'failing';

export interface Check {
  readonly id: string;
  readonly label: string;
  readonly state: State;
}

const POLL_MS = 15_000;

/** How long a single probe may take before it counts as failed. */
const PROBE_TIMEOUT_MS = 4_000;

function toneOf(state: State): Tone {
  return state === 'ok' ? 'ok' : state === 'failing' ? 'danger' : 'neutral';
}

export function StatusPanel({
  locale,
  checks: initialChecks,
}: {
  locale: Locale;
  checks?: readonly Check[];
}) {
  const t = translatorFor(locale);
  const [checks, setChecks] = useState<readonly Check[]>(
    initialChecks ?? [
      { id: 'web', label: t('checkWeb'), state: 'ok' },
      { id: 'api', label: t('checkApi'), state: 'checking' },
      { id: 'database', label: t('checkDatabase'), state: 'checking' },
    ],
  );
  const read = useCallback(
    async (signal: AbortSignal): Promise<{ api: State; database: State }> => {
      const answer = async (url: string): Promise<State> => {
        try {
          const response = await fetch(url, { cache: 'no-store', signal });
          return response.ok ? 'ok' : 'failing';
        } catch {
          // Includes our own abort on unmount, and a refused connection: both
          // mean "not working", and neither is worth distinguishing to a reader.
          return 'failing';
        }
      };
      const [api, database] = await Promise.all([answer('/api/health'), answer('/api/ready')]);
      return { api, database };
    },
    [],
  );

  useEffect(() => {
    // Reading is separated from applying so the state write happens in a
    // callback, once the network has actually answered — never during the
    // effect's own synchronous body.
    const apply = (result: { api: State; database: State }): void => {
      setChecks([
        { id: 'web', label: t('checkWeb'), state: 'ok' },
        { id: 'api', label: t('checkApi'), state: result.api },
        { id: 'database', label: t('checkDatabase'), state: result.database },
      ]);
    };

    // Probe straight away, then on a timer. Waiting for the first interval would
    // leave the panel claiming "checking" for a quarter of a minute on a page
    // nobody refreshes — and a status that only refreshes when you come back is
    // not a status.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const poll = (): void => {
      void read(controller.signal).then(apply);
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      clearTimeout(timeout);
      clearInterval(timer);
      controller.abort();
    };
  }, [read, t]);

  const iconFor = (id: string) => (id === 'database' ? <IconDatabase /> : <IconServer />);

  const helpFor = (id: string, state: State): string | null => {
    if (state !== 'failing') return null;
    if (id === 'api') return t('checkApiHelp');
    if (id === 'database') return t('checkDatabaseHelp');
    if (id === 'web') return t('checkWebHelp');
    return null;
  };

  return (
    <Card>
      <CardHeader
        title={t('checkStatusTitle')}
        description={t('statusSubtitle')}
        action={
          <Badge tone={checks.some((check) => check.state === 'failing') ? 'danger' : 'ok'}>
            {checks.some((check) => check.state === 'failing')
              ? t('statusDegraded')
              : checks.some((check) => check.state === 'checking')
                ? t('statusChecking')
                : t('statusOk')}
          </Badge>
        }
      />
      <CardBody>
        <ul className="grid gap-2 sm:grid-cols-3">
          {checks.map((check) => {
            const help = helpFor(check.id, check.state);
            return (
              <li
                key={check.id}
                className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <span className="text-ink-subtle">{iconFor(check.id)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{check.label}</span>
                  <span className="flex items-center gap-1.5">
                    {check.state === 'ok' ? <IconCheck className="size-4 text-ok" /> : null}
                    {check.state === 'failing' ? <IconAlert className="size-4 text-danger" /> : null}
                    <StatusDot tone={toneOf(check.state)} />
                  </span>
                </div>
                {help ? <p className="text-xs text-ink-muted">{help}</p> : null}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
