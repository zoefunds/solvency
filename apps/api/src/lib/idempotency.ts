import { createHash } from "node:crypto";

/**
 * In-memory idempotency store keyed by Idempotency-Key, bound to a fingerprint of
 * the normalised request body. Same key + same body → cached result. Same key +
 * different body → conflict. Single-instance only; documented in README — a
 * multi-instance deployment must swap this for a shared store.
 */

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 5_000;

interface Entry {
  fingerprint: string;
  status: number;
  body: unknown;
  expires: number;
  pending: boolean;
}

const store = new Map<string, Entry>();

export function fingerprint(route: string, body: unknown): string {
  return createHash("sha256").update(route + "\n" + JSON.stringify(body)).digest("hex");
}

export function idemLookup(key: string, fp: string): { hit: Entry | null; conflict: boolean } {
  const e = store.get(key);
  if (!e || e.expires < Date.now()) return { hit: null, conflict: false };
  if (e.fingerprint !== fp) return { hit: null, conflict: true };
  return { hit: e, conflict: false };
}

export function idemBegin(key: string, fp: string): void {
  evict();
  store.set(key, { fingerprint: fp, status: 0, body: null, expires: Date.now() + TTL_MS, pending: true });
}

export function idemComplete(key: string, fp: string, status: number, body: unknown): void {
  store.set(key, { fingerprint: fp, status, body, expires: Date.now() + TTL_MS, pending: false });
}

export function idemAbort(key: string): void {
  store.delete(key);
}

function evict(): void {
  if (store.size < MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, e] of store) {
    if (e.expires < now) store.delete(k);
  }
  while (store.size >= MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first === undefined) break;
    store.delete(first);
  }
}

export function _resetIdempotency(): void {
  store.clear();
}
