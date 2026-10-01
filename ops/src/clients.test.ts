import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManifestError, isReady, originOf, parseManifest } from './clients.js';

const valid = `
clients:
  - id: demo
    host: srv-01.easyerp.tn
    ssh_user: easyerp
    port: 4081
    email_domain: demo.easyerp.tn
    backups_keep: 30
`;

/** A second client appended to the valid manifest. */
function twoClients(second: { id: string; host: string; port: number }): string {
  return `${valid}
  - id: ${second.id}
    host: ${second.host}
    ssh_user: easyerp
    port: ${second.port}
    email_domain: ${second.id}.easyerp.tn
`;
}

describe('parseManifest', () => {
  it('reads a client', () => {
    const { clients } = parseManifest(valid);
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({
      id: 'demo',
      host: 'srv-01.easyerp.tn',
      sshUser: 'easyerp',
      port: 4081,
      emailDomain: 'demo.easyerp.tn',
      backupsKeep: 30,
    });
  });

  it('defaults backups_keep', () => {
    const { clients } = parseManifest(valid.replace('backups_keep: 30\n', ''));
    expect(clients[0]?.backupsKeep).toBe(30);
  });

  it('builds the origin a client is reached on', () => {
    const { clients } = parseManifest(valid);
    expect(originOf(clients[0]!)).toBe('https://srv-01.easyerp.tn:4081');
  });

  it.each([
    ['not yaml at all: [unclosed', 'valid YAML'],
    ['clients: []', 'at least one client'],
    ['other: true', 'must contain a "clients" list'],
    [valid.replace('port: 4081', 'port: "4081"'), '"port" must be an integer'],
    [valid.replace('port: 4081', 'port: 80'), '"port" must be an integer'],
    [valid.replace('port: 4081', 'port: 70000'), '"port" must be an integer'],
    [valid.replace('id: demo', 'id: Demo'), '"id" must be lowercase'],
    [valid.replace('id: demo', 'id: d'), '"id" must be lowercase'],
    [valid.replace('host: srv-01.easyerp.tn', 'host: localhost'), 'is not a hostname'],
    [valid.replace('email_domain: demo.easyerp.tn', 'email_domain: demo'), 'must be a domain'],
    [valid.replace('ssh_user: easyerp', 'ssh_user: ""'), '"ssh_user" must be a non-empty string'],
    [
      valid.replace('backups_keep: 30', 'backups_keep: 0'),
      '"backups_keep" must be a positive integer',
    ],
  ])('refuses %s', (source, message) => {
    expect(() => parseManifest(source)).toThrowError(ManifestError);
    expect(() => parseManifest(source)).toThrowError(message);
  });

  it('refuses two clients sharing a port on the same host', () => {
    expect(() =>
      parseManifest(twoClients({ id: 'second', host: 'srv-01.easyerp.tn', port: 4081 })),
    ).toThrowError('port 4081 is already used by "demo" on srv-01.easyerp.tn');
  });

  it('refuses two clients sharing an id', () => {
    expect(() =>
      parseManifest(twoClients({ id: 'demo', host: 'srv-02.easyerp.tn', port: 4082 })),
    ).toThrowError('duplicate id "demo"');
  });

  it('allows the same port on two different hosts', () => {
    const parsed = parseManifest(
      twoClients({ id: 'second', host: 'srv-02.easyerp.tn', port: 4081 }),
    );
    expect(parsed.clients).toHaveLength(2);
  });
});

describe('isReady', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Records the URL asked for and answers with the given status.
   *
   * The path is the whole point of these tests: `/ready` looks right and 404s,
   * because the API serves everything under `/api`.
   */
  function stubFetch(status: number) {
    const fetchMock = vi.fn(
      async () => ({ ok: status >= 200 && status < 300, status }) as Response,
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('asks for /api/ready, the path the API actually serves', async () => {
    const fetchMock = stubFetch(200);
    await isReady('https://demo.easyerp.tn:4081');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.easyerp.tn:4081/api/ready',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('is ready only on a 2xx', async () => {
    stubFetch(200);
    await expect(isReady('https://demo.easyerp.tn:4081')).resolves.toBe(true);

    stubFetch(503);
    await expect(isReady('https://demo.easyerp.tn:4081')).resolves.toBe(false);

    stubFetch(404);
    await expect(isReady('https://demo.easyerp.tn:4081')).resolves.toBe(false);
  });

  it('treats a refused connection as not ready, rather than throwing', async () => {
    // A deploy must report "not ready yet", not crash, while the container boots.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    await expect(isReady('https://demo.easyerp.tn:4081')).resolves.toBe(false);
  });

  it('gives up rather than hanging on an unresponsive host', async () => {
    // The stub honours the signal, as a real fetch does. A promise that simply
    // never settles would test the stub's patience rather than the timeout.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: { signal: AbortSignal }) => {
        expect(init.signal).toBeInstanceOf(AbortSignal);
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      }),
    );
    await expect(isReady('https://demo.easyerp.tn:4081', 20)).resolves.toBe(false);
  });
});
