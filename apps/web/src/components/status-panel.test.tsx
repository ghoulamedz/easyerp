/**
 * @vitest-environment jsdom
 *
 * The status panel. Its whole job is to be honest: an API that is up but whose
 * database is not is `degraded`, not `ok`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StatusPanel } from './status-panel';

function mockFetch(responses: Record<string, number>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const status = responses[url] ?? 500;
    void init;
    return { ok: status >= 200 && status < 300, status } as Response;
  });
}

let fetchMock: ReturnType<typeof mockFetch>;

beforeEach(() => {
  // Both arguments are forwarded: the test asserts on the init, so a stub that
  // swallowed it would make the assertion pass for the wrong reason.
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => fetchMock(input, init));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StatusPanel', () => {
  it('starts in a checking state rather than claiming success', () => {
    fetchMock = mockFetch({});
    render(<StatusPanel locale="en" />);

    expect(screen.getByText('Checking…')).toBeInTheDocument();
    expect(screen.queryByText('Operational')).not.toBeInTheDocument();
  });

  it('reports operational when the API and the database both answer', async () => {
    fetchMock = mockFetch({ '/api/health': 200, '/api/ready': 200 });
    render(<StatusPanel locale="en" />);

    await waitFor(() => expect(screen.getByText('Operational')).toBeInTheDocument());
  });

  it('reports degraded when the API answers but the database does not', async () => {
    // The distinction that matters: "reachable" is not "usable".
    fetchMock = mockFetch({ '/api/health': 200, '/api/ready': 503 });
    render(<StatusPanel locale="en" />);

    await waitFor(() => expect(screen.getByText('Degraded')).toBeInTheDocument());
  });

  it('reports degraded when the API is not there at all', async () => {
    fetchMock = mockFetch({ '/api/health': 500, '/api/ready': 500 });
    render(<StatusPanel locale="en" />);

    await waitFor(() => expect(screen.getByText('Degraded')).toBeInTheDocument());
  });

  it('treats a network failure as down, not as a passing status', async () => {
    fetchMock = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    render(<StatusPanel locale="en" />);

    await waitFor(() => expect(screen.getByText('Degraded')).toBeInTheDocument());
  });

  it('lists the three services it is checking', async () => {
    fetchMock = mockFetch({ '/api/health': 200, '/api/ready': 200 });
    render(<StatusPanel locale="en" />);

    expect(screen.getByText('Web interface')).toBeInTheDocument();
    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
  });

  it('is translated', () => {
    fetchMock = mockFetch({});
    render(<StatusPanel locale="fr" />);

    expect(screen.getByText('Base de données')).toBeInTheDocument();
    expect(screen.getByText('Vérification…')).toBeInTheDocument();
  });

  it('never caches the probe, so it reflects the current state', async () => {
    fetchMock = mockFetch({ '/api/health': 200, '/api/ready': 200 });
    render(<StatusPanel locale="en" />);
    await waitFor(() => expect(screen.getByText('Operational')).toBeInTheDocument());

    for (const call of fetchMock.mock.calls) {
      const init = (call as [RequestInfo | URL, RequestInit | undefined])[1];
      expect(init?.cache).toBe('no-store');
    }
  });
});
