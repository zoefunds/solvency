/**
 * Threat-intel ingestion. All lists are third-party, unauthenticated, and may be
 * wrong or stale — matches are reported as pattern matches, never "confirmed malicious".
 * List content only ever feeds risk classification fields; it is never interpolated
 * into executable logic or HTML.
 */

const SOURCES = {
  mewDarklist:
    "https://raw.githubusercontent.com/MyEtherWallet/ethereum-lists/master/src/addresses/addresses-darklist.json",
  ofacSanctioned:
    "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.txt",
  scamSniffer:
    "https://raw.githubusercontent.com/scamsniffer/scam-database/main/blacklist/address.json",
} as const;

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min; sanctions freshness documented in README
const FETCH_TIMEOUT_MS = 8_000;

export interface IntelMatch {
  matched: boolean;
  sources: string[];
  sanctioned: boolean;
}

export interface IntelState {
  available: boolean;
  loadedSources: string[];
  failedSources: string[];
  fetchedAt: string | null;
}

interface CacheEntry {
  drainers: Set<string>;
  sanctioned: Set<string>;
  state: IntelState;
  expires: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<CacheEntry> | null = null;

async function fetchWithTimeout(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "text/plain, application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function load(): Promise<CacheEntry> {
  const drainers = new Set<string>();
  const sanctioned = new Set<string>();
  const loaded: string[] = [];
  const failed: string[] = [];

  const jobs: [string, () => Promise<void>][] = [
    [
      "mew-darklist",
      async () => {
        const rows = JSON.parse(await fetchWithTimeout(SOURCES.mewDarklist)) as { address?: string }[];
        for (const r of rows) if (typeof r.address === "string") drainers.add(r.address.toLowerCase());
      },
    ],
    [
      "scamsniffer-blacklist",
      async () => {
        const rows = JSON.parse(await fetchWithTimeout(SOURCES.scamSniffer)) as string[];
        for (const a of rows) if (typeof a === "string") drainers.add(a.toLowerCase());
      },
    ],
    [
      "ofac-sdn-eth",
      async () => {
        for (const line of (await fetchWithTimeout(SOURCES.ofacSanctioned)).split("\n")) {
          const a = line.trim().toLowerCase();
          if (/^0x[0-9a-f]{40}$/.test(a)) sanctioned.add(a);
        }
      },
    ],
  ];

  await Promise.all(
    jobs.map(async ([name, fn]) => {
      try {
        await fn();
        loaded.push(name);
      } catch {
        failed.push(name);
      }
    })
  );

  return {
    drainers,
    sanctioned,
    state: {
      available: loaded.length > 0,
      loadedSources: loaded,
      failedSources: failed,
      fetchedAt: new Date().toISOString(),
    },
    expires: Date.now() + CACHE_TTL_MS,
  };
}

async function ensure(): Promise<CacheEntry> {
  if (cache && cache.expires > Date.now()) return cache;
  if (!inFlight) {
    inFlight = load().finally(() => {
      inFlight = null;
    });
  }
  cache = await inFlight;
  return cache;
}

export async function checkAddress(address: string): Promise<IntelMatch & { state: IntelState }> {
  const entry = await ensure();
  const a = address.toLowerCase();
  const sources: string[] = [];
  if (entry.drainers.has(a)) sources.push("community-drainer-list");
  const isSanctioned = entry.sanctioned.has(a);
  if (isSanctioned) sources.push("ofac-sdn-eth");
  return { matched: sources.length > 0, sources, sanctioned: isSanctioned, state: entry.state };
}

export async function intelStatus(): Promise<IntelState> {
  try {
    return (await ensure()).state;
  } catch {
    return { available: false, loadedSources: [], failedSources: ["all"], fetchedAt: null };
  }
}

/** test hook */
export function _resetIntelCache(): void {
  cache = null;
  inFlight = null;
}
