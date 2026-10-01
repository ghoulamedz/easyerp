/**
 * The client manifest.
 *
 * Every deployment is one Business on one host with one port (ADR 0002). This file
 * is the only place that knowledge lives, so an operator edits it rather than
 * remembering commands.
 *
 * It is parsed and validated before anything is executed: a typo in a hostname
 * must fail here, loudly, not after an ssh session has already been opened.
 */

import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

/** Hostname of a single Business deployment. */
export interface Client {
  /** Stable identifier, used for directories, container names and backups. */
  readonly id: string;
  readonly host: string;
  readonly sshUser: string;
  /** The port Caddy publishes for this Business. Unique across the host. */
  readonly port: number;
  readonly emailDomain: string;
  /** How many nightly backups to retain on disk. */
  readonly backupsKeep: number;
}

export interface ClientManifest {
  readonly clients: readonly Client[];
}

const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const ID = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

function requireString(value: unknown, field: string, where: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ManifestError(`${where}: "${field}" must be a non-empty string`);
  }
  return value.trim();
}

function requirePositiveInteger(value: unknown, field: string, where: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ManifestError(`${where}: "${field}" must be a positive integer`);
  }
  return value;
}

function requirePort(value: unknown, where: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_PORT ||
    value > MAX_PORT
  ) {
    throw new ManifestError(
      `${where}: "port" must be an integer between ${MIN_PORT} and ${MAX_PORT}`,
    );
  }
  return value;
}

export function parseManifest(source: string): ClientManifest {
  let document: unknown;
  try {
    document = parse(source);
  } catch (error) {
    throw new ManifestError(`clients.yaml is not valid YAML: ${(error as Error).message}`);
  }

  if (typeof document !== 'object' || document === null || !('clients' in document)) {
    throw new ManifestError('clients.yaml must contain a "clients" list');
  }
  const rawClients = (document as { clients: unknown }).clients;
  if (!Array.isArray(rawClients) || rawClients.length === 0) {
    throw new ManifestError('clients.yaml must list at least one client');
  }

  const clients: Client[] = [];
  const seenIds = new Set<string>();
  // Keyed by host as well as port: two different hosts may publish the same port.
  const seenPorts = new Map<string, string>();

  for (const [index, entry] of rawClients.entries()) {
    const where = `clients[${index}]`;
    if (typeof entry !== 'object' || entry === null) {
      throw new ManifestError(`${where}: must be a mapping`);
    }
    const raw = entry as Record<string, unknown>;

    const id = requireString(raw.id, 'id', where);
    const host = requireString(raw.host, 'host', where);
    const emailDomain = requireString(raw.email_domain, 'email_domain', where);
    const port = requirePort(raw.port, where);
    const backupsKeep = requirePositiveInteger(raw.backups_keep ?? 30, 'backups_keep', where);

    if (!ID.test(id)) {
      throw new ManifestError(`${where}: "id" must be lowercase alphanumeric with dashes`);
    }
    if (!HOSTNAME.test(host)) {
      throw new ManifestError(`${where}: "host" "${host}" is not a hostname`);
    }
    if (!emailDomain.includes('.')) {
      throw new ManifestError(`${where}: "email_domain" must be a domain`);
    }
    if (seenIds.has(id)) {
      throw new ManifestError(`${where}: duplicate id "${id}"`);
    }
    const portKey = `${host}:${port}`;
    const portOwner = seenPorts.get(portKey);
    if (portOwner !== undefined) {
      throw new ManifestError(
        `${where}: port ${port} is already used by "${portOwner}" on ${host}`,
      );
    }
    seenIds.add(id);
    seenPorts.set(portKey, id);
    clients.push({
      id,
      host,
      port,
      emailDomain,
      sshUser: requireString(raw.ssh_user, 'ssh_user', where),
      backupsKeep,
    });
  }

  return { clients };
}

export async function loadManifest(path: string): Promise<ClientManifest> {
  return parseManifest(await readFile(path, 'utf8'));
}

/** The public origin a client is reached on. */
export function originOf(client: Client): string {
  return `https://${client.host}:${client.port}`;
}

/**
 * True when a readiness check answered 200 within the timeout.
 *
 * `/api/ready`, not `/ready`: the API serves everything under `/api`, which is
 * the same path the browser and the container healthcheck use.
 */
export async function isReady(origin: string, timeoutMs = 5_000): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/ready`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}
