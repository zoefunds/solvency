import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { weighExposure, aggregate, overallConfidence, BASE_DISCOUNT, DISCOUNT_CEILING } from "./weighting.js";
import { ValuationRequest, SimulationRequest, ValuationResponse, SimulationResponse } from "./schemas.js";
import { valuateWallet, simulateTransaction } from "./valuator.js";
import { _resetIntelCache } from "./threat-intel.js";
import type { ChainDataProvider } from "./chain-provider.js";

const WALLET = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";
const USDT_XL = "0x779ded0c9e1022225f8e0630b35a9b54be713736";

function stubIntel(opts?: { drainer?: string; fail?: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (opts?.fail && u.includes("githubusercontent")) throw new Error("intel down");
      if (u.includes("darklist"))
        return new Response(JSON.stringify(opts?.drainer ? [{ address: opts.drainer }] : []));
      if (u.includes("scam-database")) return new Response(JSON.stringify([]));
      if (u.includes("ofac")) return new Response("");
      if (u.includes("coins.llama.fi"))
        return new Response(
          JSON.stringify({ coins: { "coingecko:tether": { price: 1 }, "coingecko:okb": { price: 50 } } })
        );
      throw new Error("unexpected fetch " + u);
    })
  );
}

function provider(over?: Partial<ChainDataProvider>): ChainDataProvider {
  return {
    getBalances: async () => ({
      balances: [{ token: USDT_XL, symbol: "USDT0", amount: 50_000_000_000n, decimals: 6 }],
      partial: false,
    }),
    getApprovals: async () => ({
      approvals: [
        {
          token: USDT_XL,
          tokenSymbol: "USDT0",
          spender: SPENDER,
          allowance: 2n ** 200n,
          unlimited: true,
          lastSeenBlock: 1n,
        },
      ],
      partial: false,
    }),
    getContractMetadata: async (address) => ({
      address,
      isContract: true,
      verificationKnown: false,
      verified: false,
      retrievedAt: new Date().toISOString(),
    }),
    ...over,
  };
}

beforeEach(() => _resetIntelCache());
afterEach(() => vi.unstubAllGlobals());

describe("weighting formula", () => {
  it("applies zero discount for safe scoped/no exposure", () => {
    expect(weighExposure({ tier: "verified_low_risk", scope: "none", ageDays: 0, sanctioned: false, exposedValueUsd: 1000 }).discountedUsd).toBe(0);
  });
  it("caps discount at ceiling even for drainer + stale", () => {
    const w = weighExposure({ tier: "active_drainer_signature", scope: "unlimited", ageDays: 400, sanctioned: true, exposedValueUsd: 1000 });
    expect(w.discountFraction).toBeLessThanOrEqual(DISCOUNT_CEILING);
    expect(w.discountedUsd).toBe(950);
  });
  it("never goes negative and aggregate floors at zero", () => {
    const m = new Map([["t", { holdingUsd: 100, discounts: [500] }]]);
    const { riskAdjustedUsd, atRiskUsd } = aggregate(100, m);
    expect(atRiskUsd).toBeLessThanOrEqual(100);
    expect(riskAdjustedUsd).toBeGreaterThanOrEqual(0);
  });
  it("all-safe portfolio keeps nominal value", () => {
    const m = new Map([["t", { holdingUsd: 100, discounts: [] }]]);
    expect(aggregate(100, m).riskAdjustedUsd).toBe(100);
  });
  it("missing data degrades confidence, not safety", () => {
    expect(overallConfidence({ priceDataMissing: true, threatIntelUnavailable: false, chainDataPartial: true, anyInsufficientTier: false })).toBe("insufficient_data");
    expect(overallConfidence({ priceDataMissing: false, threatIntelUnavailable: true, chainDataPartial: false, anyInsufficientTier: false })).toBe("low");
    expect(BASE_DISCOUNT.insufficient_data).toBeGreaterThan(0);
  });
});

describe("input schemas", () => {
  it("rejects malformed addresses", () => {
    expect(ValuationRequest.safeParse({ wallet_address: "nope", chain: "eip155:196" }).success).toBe(false);
  });
  it("rejects oversized calldata", () => {
    const r = SimulationRequest.safeParse({
      wallet_address: WALLET,
      chain: "eip155:196",
      proposed_transaction: { to: SPENDER, data: "0x" + "ab".repeat(20_000) },
    });
    expect(r.success).toBe(false);
  });
  it("accepts a valid simulation request", () => {
    expect(
      SimulationRequest.safeParse({
        wallet_address: WALLET,
        chain: "eip155:196",
        proposed_transaction: { to: SPENDER, decoded_intent: "approval" },
      }).success
    ).toBe(true);
  });
});

describe("valuation engine", () => {
  it("discounts holdings behind a drainer-listed unlimited approval and validates schema", async () => {
    stubIntel({ drainer: SPENDER });
    const res = await valuateWallet(
      provider(),
      { wallet_address: WALLET, chain: "eip155:196", valuation_depth: "holdings_plus_approvals" },
      1_000_000n
    );
    ValuationResponse.parse(res);
    expect(res.nominal_value_usd).toBe(50_000);
    expect(res.risk_adjusted_net_worth_usd).toBeLessThan(50_000);
    expect(res.exposure_findings[0]?.contract_risk_tier).toBe("known_exploit_history");
  });

  it("chain provider failure degrades to insufficient evidence, not false-safe", async () => {
    stubIntel();
    const res = await valuateWallet(
      provider({ getApprovals: async () => ({ approvals: [], partial: true }) }),
      { wallet_address: WALLET, chain: "eip155:196", valuation_depth: "holdings_plus_approvals" },
      null
    );
    expect(res.exposure_attribution.primary).toBe("insufficient_evidence");
    expect(["low", "insufficient_data"]).toContain(res.valuation_confidence);
  });

  it("threat-intel unavailable degrades classification to insufficient_data", async () => {
    stubIntel({ fail: true });
    const res = await valuateWallet(
      provider(),
      { wallet_address: WALLET, chain: "eip155:196", valuation_depth: "holdings_plus_approvals" },
      null
    );
    expect(res.exposure_findings[0]?.contract_risk_tier).toBe("insufficient_data");
    expect(res.valuation_confidence).not.toBe("high");
  });
});

describe("simulation engine", () => {
  it("flags unlimited approval to a threat-intel-matched contract as do_not_sign", async () => {
    stubIntel({ drainer: SPENDER });
    const res = await simulateTransaction(
      provider(),
      {
        wallet_address: WALLET,
        chain: "eip155:196",
        proposed_transaction: {
          to: USDT_XL,
          data: "0x095ea7b3" + SPENDER.slice(2).padStart(64, "0") + "f".repeat(64),
          decoded_intent: "approval",
        },
      },
      null
    );
    SimulationResponse.parse(res);
    expect(res.newly_exposed_value_usd).toBeGreaterThan(0);
    expect(res.risk_adjusted_net_worth_usd).toBeLessThan(res.nominal_value_usd);
  });
});
