export type RecordData = Record<string, string | number | boolean>;
export type RecordKind = 'logbook' | 'duty';

export interface LedgerEntry {
  id: string;
  createdAt: string;
  data: RecordData;
  deviceId: string;
  sequence: number;
  previousHash: string;
  auditHash: string;
}

export interface AuditEntry {
  id: string;
  kind: RecordKind;
  createdAt: string;
  deviceId: string;
  sequence: number;
  previousHash: string;
  hash: string;
}

export interface AeroSlateLedger {
  version: 2;
  logbook: LedgerEntry[];
  duty: LedgerEntry[];
  audit: AuditEntry[];
  updatedAt: string;
}

export interface GitHubCloudConfig {
  token: string;
  gistId: string;
  passphrase: string;
}

interface VaultEnvelope {
  format: 'aeroslate-encrypted-ledger';
  version: 1;
  cipher: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  updatedAt: string;
}

const GIST_FILENAME = 'aeroslate-ledger.vault.json';
const API_VERSION = '2022-11-28';
const PBKDF2_ITERATIONS = 250_000;

export function emptyLedger(): AeroSlateLedger {
  return { version: 2, logbook: [], duty: [], audit: [], updatedAt: new Date(0).toISOString() };
}

export function normalizeLedger(value: unknown): AeroSlateLedger {
  const source = value && typeof value === 'object' ? value as Partial<AeroSlateLedger> : {};
  return {
    version: 2,
    logbook: Array.isArray(source.logbook) ? source.logbook.filter(Boolean) as LedgerEntry[] : [],
    duty: Array.isArray(source.duty) ? source.duty.filter(Boolean) as LedgerEntry[] : [],
    audit: Array.isArray(source.audit) ? source.audit.filter(Boolean) as AuditEntry[] : [],
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date(0).toISOString()
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toOwnedArrayBuffer(bytes: Uint8Array<ArrayBufferLike>): ArrayBuffer {
  // Web Crypto's BufferSource declarations in TypeScript 5.9 require an
  // ArrayBuffer-backed view, not a view that might use SharedArrayBuffer.
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  return owned.buffer;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toOwnedArrayBuffer(new TextEncoder().encode(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function getOrCreateDeviceId(): string {
  const key = 'aeroslate.records.deviceId';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(key, next);
  return next;
}

export async function appendLedgerRecord(ledgerInput: AeroSlateLedger, kind: RecordKind, data: RecordData, deviceId: string): Promise<{ ledger: AeroSlateLedger; record: LedgerEntry }> {
  const ledger = normalizeLedger(ledgerInput);
  const prior = ledger.audit.filter(item => item.deviceId === deviceId).sort((a, b) => a.sequence - b.sequence).at(-1);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const sequence = (prior?.sequence || 0) + 1;
  const previousHash = prior?.hash || 'GENESIS';
  const canonical = stableJson({ id, kind, createdAt, data, deviceId, sequence, previousHash });
  const auditHash = await sha256Hex(canonical);
  const record: LedgerEntry = { id, createdAt, data, deviceId, sequence, previousHash, auditHash };
  const next: AeroSlateLedger = {
    ...ledger,
    [kind]: [...ledger[kind], record],
    audit: [...ledger.audit, { id, kind, createdAt, deviceId, sequence, previousHash, hash: auditHash }],
    updatedAt: createdAt
  };
  return { ledger: next, record };
}

function uniqueById<T extends { id: string }>(left: T[], right: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of [...left, ...right]) {
    const current = map.get(item.id);
    if (!current || String((item as any).createdAt || '') >= String((current as any).createdAt || '')) map.set(item.id, item);
  }
  return [...map.values()].sort((a, b) => {
    const aTime = String((a as any).createdAt || '');
    const bTime = String((b as any).createdAt || '');
    return aTime.localeCompare(bTime) || a.id.localeCompare(b.id);
  });
}

export function mergeLedgers(localInput: AeroSlateLedger, cloudInput: AeroSlateLedger): AeroSlateLedger {
  const local = normalizeLedger(localInput);
  const cloud = normalizeLedger(cloudInput);
  return {
    version: 2,
    logbook: uniqueById(local.logbook, cloud.logbook),
    duty: uniqueById(local.duty, cloud.duty),
    audit: uniqueById(local.audit, cloud.audit),
    updatedAt: new Date(Math.max(Date.parse(local.updatedAt) || 0, Date.parse(cloud.updatedAt) || 0, Date.now())).toISOString()
  };
}

async function deriveVaultKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', toOwnedArrayBuffer(new TextEncoder().encode(passphrase)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toOwnedArrayBuffer(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptLedger(ledger: AeroSlateLedger, passphrase: string): Promise<string> {
  if (passphrase.trim().length < 12) throw new Error('Cloud encryption passphrase must contain at least 12 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(normalizeLedger(ledger)));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toOwnedArrayBuffer(iv) }, key, toOwnedArrayBuffer(plaintext));
  const envelope: VaultEnvelope = {
    format: 'aeroslate-encrypted-ledger',
    version: 1,
    cipher: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    updatedAt: new Date().toISOString()
  };
  return JSON.stringify(envelope);
}

export async function decryptLedger(payload: string, passphrase: string): Promise<AeroSlateLedger> {
  let envelope: VaultEnvelope;
  try { envelope = JSON.parse(payload) as VaultEnvelope; }
  catch { throw new Error('The cloud vault is not valid JSON.'); }
  if (envelope.format !== 'aeroslate-encrypted-ledger' || envelope.cipher !== 'AES-GCM') throw new Error('This is not an AeroSlate encrypted ledger.');
  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const key = await deriveVaultKey(passphrase, salt, Number(envelope.iterations || PBKDF2_ITERATIONS));
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toOwnedArrayBuffer(iv) },
      key,
      toOwnedArrayBuffer(base64ToBytes(envelope.ciphertext))
    );
    return normalizeLedger(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {
    throw new Error('Unable to decrypt the cloud vault. Check the passphrase.');
  }
}

function githubHeaders(token: string): HeadersInit {
  if (!token.trim()) throw new Error('Enter a GitHub token with Gists read/write permission.');
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token.trim()}`,
    'x-github-api-version': API_VERSION,
    'content-type': 'application/json'
  };
}

async function githubError(response: Response): Promise<Error> {
  let message = `GitHub returned HTTP ${response.status}.`;
  try {
    const body = await response.json();
    if (body?.message) message = `GitHub: ${body.message}`;
  } catch { /* no-op */ }
  if (response.status === 401) message = 'GitHub rejected the token. Check that it is current and has Gists permission.';
  if (response.status === 404) message = 'The private Gist was not found or this token cannot access it.';
  return new Error(message);
}

export async function readLedgerGist(config: GitHubCloudConfig): Promise<AeroSlateLedger> {
  if (!config.gistId.trim()) throw new Error('No GitHub Gist has been connected yet.');
  const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(config.gistId.trim())}`, { headers: githubHeaders(config.token) });
  if (!response.ok) throw await githubError(response);
  const gist = await response.json();
  const file = gist?.files?.[GIST_FILENAME];
  if (!file) throw new Error(`The Gist does not contain ${GIST_FILENAME}.`);
  let content = String(file.content || '');
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url, { headers: githubHeaders(config.token) });
    if (!raw.ok) throw await githubError(raw);
    content = await raw.text();
  }
  return decryptLedger(content, config.passphrase);
}

export async function writeLedgerGist(config: GitHubCloudConfig, ledger: AeroSlateLedger): Promise<string> {
  const content = await encryptLedger(ledger, config.passphrase);
  const body = JSON.stringify({
    description: 'AeroSlate EFB encrypted logbook and duty ledger',
    public: false,
    files: { [GIST_FILENAME]: { content } }
  });
  const gistId = config.gistId.trim();
  const response = await fetch(gistId ? `https://api.github.com/gists/${encodeURIComponent(gistId)}` : 'https://api.github.com/gists', {
    method: gistId ? 'PATCH' : 'POST',
    headers: githubHeaders(config.token),
    body
  });
  if (!response.ok) throw await githubError(response);
  const gist = await response.json();
  if (!gist?.id) throw new Error('GitHub did not return a Gist ID.');
  return String(gist.id);
}

export async function synchronizeLedger(config: GitHubCloudConfig, localLedger: AeroSlateLedger): Promise<{ ledger: AeroSlateLedger; gistId: string }> {
  let merged = normalizeLedger(localLedger);
  if (config.gistId.trim()) {
    const remote = await readLedgerGist(config);
    merged = mergeLedgers(merged, remote);
  }
  const gistId = await writeLedgerGist(config, merged);
  return { ledger: merged, gistId };
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function recordsToCsv(records: LedgerEntry[]): string {
  const keys = [...new Set(records.flatMap(record => Object.keys(record.data || {})))];
  const header = ['id', 'createdAt', ...keys, 'deviceId', 'sequence', 'previousHash', 'auditHash'];
  return [header, ...records.map(record => [record.id, record.createdAt, ...keys.map(key => record.data?.[key] ?? ''), record.deviceId, record.sequence, record.previousHash, record.auditHash])]
    .map(row => row.map(csvEscape).join(','))
    .join('\r\n');
}

export function downloadText(filename: string, content: string, type = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
