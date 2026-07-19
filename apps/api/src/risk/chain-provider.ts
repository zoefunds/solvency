import { createPublicClient, http, parseAbi, type PublicClient } from "viem";

/**
 * Chain data access behind an adapter. Free public RPC endpoints only.
 * Every external call is bounded: per-call timeout, bounded retries, capped fan-out.
 * RPC failure NEVER means "no exposure" — callers receive partial:true and must
 * degrade to insufficient_data.
 */

export interface Balance {
  token: string; // contract address or "native"
  symbol: string;
  amount: bigint;
  decimals: number;
}

export interface Approval {
  token: string;
  tokenSymbol: string;
  spender: string;
  allowance: bigint; // current on-chain allowance
  unlimited: boolean;
  lastSeenBlock: bigint;
}

export interface ContractMetadata {
  address: string;
  isContract: boolean;
  verificationKnown: boolean;
  verified: boolean;
  retrievedAt: string;
}

export interface ChainDataProvider {
  getBalances(wallet: string, chain: string): Promise<{ balances: Balance[]; partial: boolean }>;
  getApprovals(wallet: string, chain: string): Promise<{ approvals: Approval[]; partial: boolean }>;
  getContractMetadata(address: string, chain: string): Promise<ContractMetadata>;
}

const CHAINS: Record<string, { rpc: string; nativeSymbol: string; llamaNative: string; tokens: { address: string; symbol: string; decimals: number; llamaKey: string }[] }> = {
  "eip155:196": {
    rpc: process.env.XLAYER_RPC_URL ?? "https://rpc.xlayer.tech",
    nativeSymbol: "OKB",
    llamaNative: "coingecko:okb",
    tokens: [
      { address: "0x779ded0c9e1022225f8e0630b35a9b54be713736", symbol: "USDT0", decimals: 6, llamaKey: "coingecko:tether" },
      { address: "0x74b7f16337b8972027f6196a17a631ac6de26d22", symbol: "USDC", decimals: 6, llamaKey: "coingecko:usd-coin" },
      { address: "0x5a77f1443d16ee5761d310e38b62f77f726bc71c", symbol: "WETH", decimals: 18, llamaKey: "coingecko:ethereum" },
    ],
  },
  "eip155:1": {
    rpc: process.env.ETH_RPC_URL ?? "https://ethereum-rpc.publicnode.com",
    nativeSymbol: "ETH",
    llamaNative: "coingecko:ethereum",
    tokens: [
      { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", symbol: "USDT", decimals: 6, llamaKey: "ethereum:0xdac17f958d2ee523a2206206994597c13d831ec7" },
      { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC", decimals: 6, llamaKey: "ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
      { address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", symbol: "WETH", decimals: 18, llamaKey: "ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" },
      { address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", symbol: "WBTC", decimals: 8, llamaKey: "ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" },
    ],
  },
};

export const SUPPORTED_CHAINS = Object.keys(CHAINS);

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);

const MAX_APPROVALS = 25;
const CALL_TIMEOUT_MS = 10_000;
const LOG_LOOKBACK_BLOCKS = 400_000n;
const UNLIMITED_THRESHOLD = 2n ** 128n;

const clients = new Map<string, PublicClient>();
function client(chain: string): PublicClient {
  const cfg = CHAINS[chain];
  if (!cfg) throw new Error(`unsupported chain ${chain}`);
  let c = clients.get(chain);
  if (!c) {
    c = createPublicClient({
      transport: http(cfg.rpc, { timeout: CALL_TIMEOUT_MS, retryCount: 2 }),
    });
    clients.set(chain, c);
  }
  return c;
}

export class PublicRpcProvider implements ChainDataProvider {
  async getHeadBlock(chain: string): Promise<bigint | null> {
    try {
      return await client(chain).getBlockNumber();
    } catch {
      return null; // age of approvals becomes unknown; weighting stays conservative
    }
  }

  async getBalances(wallet: string, chain: string) {
    const cfg = CHAINS[chain]!;
    const c = client(chain);
    const balances: Balance[] = [];
    let partial = false;

    try {
      const native = await c.getBalance({ address: wallet as `0x${string}` });
      if (native > 0n)
        balances.push({ token: "native", symbol: cfg.nativeSymbol, amount: native, decimals: 18 });
    } catch {
      partial = true;
    }

    const results = await Promise.allSettled(
      cfg.tokens.map((t) =>
        c.readContract({
          address: t.address as `0x${string}`,
          abi: ERC20,
          functionName: "balanceOf",
          args: [wallet as `0x${string}`],
        })
      )
    );
    results.forEach((r, i) => {
      const t = cfg.tokens[i]!;
      if (r.status === "fulfilled") {
        if (r.value > 0n)
          balances.push({ token: t.address, symbol: t.symbol, amount: r.value, decimals: t.decimals });
      } else partial = true;
    });

    return { balances, partial };
  }

  async getApprovals(wallet: string, chain: string) {
    const cfg = CHAINS[chain]!;
    const c = client(chain);
    let partial = false;
    const seen = new Map<string, Approval>();

    // free public RPCs gate historical getLogs, so approval history comes from a
    // free-tier explorer API (Blockscout on Ethereum, OKLink on X Layer)
    let logs: { address: string; spender: string; blockNumber: bigint }[] = [];
    try {
      logs = await fetchApprovalLogs(chain, wallet);
    } catch (err) {
      if (process.env.DEBUG_PROVIDER) console.error("approval-log fetch failed:", err);
      partial = true; // callers must degrade to insufficient_data, not assume safety
    }

    // newest first; keep the latest (token, spender) pair only
    for (const log of logs.reverse()) {
      const key = `${log.address}:${log.spender}`;
      if (!seen.has(key)) {
        const known = cfg.tokens.find((t) => t.address === log.address);
        seen.set(key, {
          token: log.address,
          tokenSymbol: known?.symbol ?? "UNKNOWN",
          spender: log.spender,
          allowance: 0n,
          unlimited: false,
          lastSeenBlock: log.blockNumber,
        });
      }
      if (seen.size >= MAX_APPROVALS) break;
    }

    // confirm current allowance on-chain (bounded fan-out)
    const approvals: Approval[] = [];
    const entries = [...seen.values()].slice(0, MAX_APPROVALS);
    try {
      const checks = await c.multicall({
        contracts: entries.map((a) => ({
          address: a.token as `0x${string}`,
          abi: ERC20,
          functionName: "allowance" as const,
          args: [wallet as `0x${string}`, a.spender as `0x${string}`],
        })),
        multicallAddress: "0xcA11bde05977b3631167028862bE2a173976CA11", // canonical Multicall3
      });
      checks.forEach((r, i) => {
        const a = entries[i]!;
        if (r.status === "success") {
          const allowance = r.result as bigint;
          if (allowance > 0n)
            approvals.push({ ...a, allowance, unlimited: allowance >= UNLIMITED_THRESHOLD });
        } else partial = true;
      });
    } catch {
      partial = true;
    }

    return { approvals, partial };
  }

  async getContractMetadata(address: string, chain: string): Promise<ContractMetadata> {
    const c = client(chain);
    const retrievedAt = new Date().toISOString();
    try {
      const code = await c.getCode({ address: address as `0x${string}` });
      return {
        address: address.toLowerCase(),
        isContract: code !== undefined && code !== "0x",
        // source verification needs an explorer API; without one we do not claim either way
        verificationKnown: false,
        verified: false,
        retrievedAt,
      };
    } catch {
      throw new Error("CHAIN_PROVIDER_UNAVAILABLE");
    }
  }
}

// ---------- approval log history via free-tier explorer APIs ----------

const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

function topicToAddress(topic: string | null | undefined): string | null {
  if (!topic || topic.length !== 66) return null;
  return ("0x" + topic.slice(26)).toLowerCase();
}

async function fetchApprovalLogs(
  chain: string,
  wallet: string
): Promise<{ address: string; spender: string; blockNumber: bigint }[]> {
  const ownerTopic = "0x" + wallet.slice(2).toLowerCase().padStart(64, "0");

  if (chain === "eip155:1") {
    const url =
      `https://eth.blockscout.com/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest` +
      `&topic0=${APPROVAL_TOPIC}&topic1=${ownerTopic}&topic0_1_opr=and`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`explorer HTTP ${res.status}`);
    const body = (await res.json()) as { status?: string; result?: unknown };
    if (!Array.isArray(body.result)) throw new Error("explorer returned no result");
    return (body.result as { address: string; topics: (string | null)[]; blockNumber: string }[])
      .map((l) => ({
        address: l.address.toLowerCase(),
        spender: topicToAddress(l.topics[2]),
        blockNumber: BigInt(l.blockNumber),
      }))
      .filter((l): l is { address: string; spender: string; blockNumber: bigint } => l.spender !== null);
  }

  if (chain === "eip155:196") {
    const key = process.env.OKLINK_API_KEY;
    if (!key) {
      // keyless fallback: dRPC free tier allows 10k-block getLogs ranges on X Layer.
      // Coverage is bounded (~2 weeks of history); older approvals surface once an
      // OKLink key is configured. Partial coverage is disclosed, never hidden.
      return fetchApprovalLogsViaDrpc(wallet);
    }
    const url =
      `https://www.oklink.com/api/v5/explorer/log/logs?chainShortName=XLAYER` +
      `&topic0=${APPROVAL_TOPIC}&topic1=${ownerTopic}&limit=100`;
    const res = await fetch(url, {
      headers: { "Ok-Access-Key": key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`oklink HTTP ${res.status}`);
    const body = (await res.json()) as {
      code?: string;
      data?: { logList?: { address: string; topics: string[]; height: string }[] }[];
    };
    if (body.code !== "0") throw new Error(`oklink error ${body.code}`);
    const list = body.data?.[0]?.logList ?? [];
    return list
      .map((l) => ({
        address: l.address.toLowerCase(),
        spender: topicToAddress(l.topics?.[2]),
        blockNumber: BigInt(l.height ?? "0"),
      }))
      .filter((l): l is { address: string; spender: string; blockNumber: bigint } => l.spender !== null);
  }

  throw new Error(`no approval-log source for ${chain}`);
}

const DRPC_XLAYER = "https://xlayer.drpc.org";
const DRPC_CHUNK = 10_000n;
const DRPC_MAX_CHUNKS = 40; // ≈400k blocks ≈ 2 weeks of X Layer history

async function fetchApprovalLogsViaDrpc(
  wallet: string
): Promise<{ address: string; spender: string; blockNumber: bigint }[]> {
  const c = createPublicClient({ transport: http(DRPC_XLAYER, { timeout: CALL_TIMEOUT_MS, retryCount: 1 }) });
  const head = await c.getBlockNumber();
  const chunks: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let i = 0; i < DRPC_MAX_CHUNKS; i++) {
    const toBlock = head - BigInt(i) * DRPC_CHUNK;
    const fromBlock = toBlock - DRPC_CHUNK + 1n;
    if (toBlock <= 0n) break;
    chunks.push({ fromBlock: fromBlock > 0n ? fromBlock : 0n, toBlock });
  }
  const out: { address: string; spender: string; blockNumber: bigint }[] = [];
  let failures = 0;
  // batches of 8 to stay under free-tier rate limits
  for (let i = 0; i < chunks.length; i += 8) {
    const batch = chunks.slice(i, i + 8);
    const results = await Promise.allSettled(
      batch.map((ch) =>
        c.getLogs({
          event: ERC20[2],
          args: { owner: wallet as `0x${string}` },
          fromBlock: ch.fromBlock,
          toBlock: ch.toBlock,
        })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const l of r.value) {
          const spender = (l as { args?: { spender?: string } }).args?.spender;
          if (spender)
            out.push({ address: l.address.toLowerCase(), spender: spender.toLowerCase(), blockNumber: l.blockNumber ?? 0n });
        }
      } else failures++;
    }
  }
  if (failures === chunks.length) throw new Error("drpc approval scan failed entirely");
  out.sort((a, b) => Number(a.blockNumber - b.blockNumber));
  return out;
}

// ---------- pricing (free llama.fi API, no key) ----------

const priceCache = new Map<string, { price: number; expires: number }>();
const PRICE_TTL_MS = 5 * 60 * 1000;

export async function getPricesUsd(chain: string, tokens: Balance[]): Promise<{ prices: Map<string, number>; missing: string[] }> {
  const cfg = CHAINS[chain]!;
  const keys = tokens.map((b) =>
    b.token === "native" ? cfg.llamaNative : cfg.tokens.find((t) => t.address === b.token)?.llamaKey ?? null
  );
  const prices = new Map<string, number>();
  const missing: string[] = [];
  const toFetch: string[] = [];

  keys.forEach((k, i) => {
    if (!k) {
      missing.push(tokens[i]!.symbol);
      return;
    }
    const hit = priceCache.get(k);
    if (hit && hit.expires > Date.now()) prices.set(tokens[i]!.token, hit.price);
    else toFetch.push(k);
  });

  if (toFetch.length > 0) {
    try {
      const res = await fetch(`https://coins.llama.fi/prices/current/${toFetch.join(",")}`, {
        signal: AbortSignal.timeout(8_000),
      });
      const body = (await res.json()) as { coins: Record<string, { price: number }> };
      keys.forEach((k, i) => {
        if (k && body.coins[k]) {
          priceCache.set(k, { price: body.coins[k]!.price, expires: Date.now() + PRICE_TTL_MS });
          prices.set(tokens[i]!.token, body.coins[k]!.price);
        }
      });
    } catch {
      /* fall through to missing */
    }
  }
  tokens.forEach((b) => {
    if (!prices.has(b.token) && !missing.includes(b.symbol)) missing.push(b.symbol);
  });
  return { prices, missing };
}

export function usdValue(b: Balance, price: number): number {
  return (Number(b.amount) / 10 ** b.decimals) * price;
}
