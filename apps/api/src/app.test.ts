import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";
import { buildApp } from "./app.js";
import { _resetIntelCache } from "./risk/threat-intel.js";
import { _resetIdempotency } from "./lib/idempotency.js";
import type { PublicRpcProvider } from "./risk/chain-provider.js";

const WALLET = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";

const stubProvider = {
  getHeadBlock: async () => 1_000_000n,
  getBalances: async () => ({
    balances: [{ token: "0x779ded0c9e1022225f8e0630b35a9b54be713736", symbol: "USDT0", amount: 1_000_000_000n, decimals: 6 }],
    partial: false,
  }),
  getApprovals: async () => ({ approvals: [], partial: false }),
  getContractMetadata: async (address: string) => ({
    address,
    isContract: true,
    verificationKnown: false,
    verified: false,
    retrievedAt: new Date().toISOString(),
  }),
} as unknown as PublicRpcProvider;

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("githubusercontent") || u.includes("scam-database")) return new Response("[]");
      if (u.includes("coins.llama.fi"))
        return new Response(JSON.stringify({ coins: { "coingecko:tether": { price: 1 } } }));
      return new Response("{}");
    })
  );
}

beforeEach(() => {
  _resetIntelCache();
  _resetIdempotency();
  stubFetch();
  delete process.env.OKX_API_KEY;
});
afterEach(() => vi.unstubAllGlobals());

const simBody = {
  wallet_address: WALLET,
  chain: "eip155:196",
  proposed_transaction: { to: SPENDER, decoded_intent: "approval" as const },
};

describe("free endpoints", () => {
  it("GET /health returns health state", async () => {
    const { app } = buildApp({ provider: stubProvider, skipPayment: true });
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
  it("GET /v1/service returns metadata with matching prices", async () => {
    const { app } = buildApp({ provider: stubProvider, skipPayment: true });
    const res = await request(app).get("/v1/service");
    expect(res.status).toBe(200);
    expect(res.body.paid_endpoints).toHaveLength(2);
    expect(res.body.paid_endpoints[0].price_usd).toBe(0.02);
    expect(res.body.paid_endpoints[1].price_usd).toBe(0.01);
  });
  it("GET schemas work", async () => {
    const { app } = buildApp({ provider: stubProvider, skipPayment: true });
    expect((await request(app).get("/v1/schema/valuation")).status).toBe(200);
    expect((await request(app).get("/v1/schema/simulation")).status).toBe(200);
  });
});

describe("payment gating", () => {
  it("without credentials paid routes return 503 PAYMENT_NOT_CONFIGURED and business logic is NOT reached", async () => {
    const { app, instruments } = buildApp({ provider: stubProvider });
    const res = await request(app).post("/v1/risk/simulate-transaction").send(simBody);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("PAYMENT_NOT_CONFIGURED");
    expect(instruments.businessLogicInvocations.simulate).toBe(0);
    const res2 = await request(app).post("/v1/risk/valuate-wallet").send({ wallet_address: WALLET, chain: "eip155:196" });
    expect(res2.status).toBe(503);
    expect(instruments.businessLogicInvocations.valuate).toBe(0);
  });
});

describe("paid handlers (payment layer stubbed out)", () => {
  it("rejects malformed wallet address with 422", async () => {
    const { app } = buildApp({ provider: stubProvider, skipPayment: true });
    const res = await request(app)
      .post("/v1/risk/valuate-wallet")
      .send({ wallet_address: "bogus", chain: "eip155:196" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVALID_WALLET_ADDRESS");
  });
  it("rejects unsupported chain", async () => {
    const { app } = buildApp({ provider: stubProvider, skipPayment: true });
    const res = await request(app)
      .post("/v1/risk/valuate-wallet")
      .send({ wallet_address: WALLET, chain: "eip155:999999" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("UNSUPPORTED_CHAIN");
  });
  it("rejects oversized bodies with 413", async () => {
    const { app } = buildApp({ provider: stubProvider, skipPayment: true });
    const res = await request(app)
      .post("/v1/risk/valuate-wallet")
      .set("content-type", "application/json")
      .send({ wallet_address: WALLET, chain: "eip155:196", metadata: { a: "x".repeat(100_000) } });
    expect(res.status).toBe(413);
  });
  it("completes a valuation and returns the canonical schema", async () => {
    const { app, instruments } = buildApp({ provider: stubProvider, skipPayment: true });
    const res = await request(app)
      .post("/v1/risk/valuate-wallet")
      .send({ wallet_address: WALLET, chain: "eip155:196" });
    expect(res.status).toBe(200);
    expect(res.body.analysis_type).toBe("wallet_valuation");
    expect(res.body.case_id).toMatch(/^sv_/);
    expect(instruments.businessLogicInvocations.valuate).toBe(1);
  });
  it("idempotency: same key + same body replays, expensive logic runs once", async () => {
    const { app, instruments } = buildApp({ provider: stubProvider, skipPayment: true });
    const a = await request(app)
      .post("/v1/risk/valuate-wallet")
      .set("idempotency-key", "k1")
      .send({ wallet_address: WALLET, chain: "eip155:196" });
    const b = await request(app)
      .post("/v1/risk/valuate-wallet")
      .set("idempotency-key", "k1")
      .send({ wallet_address: WALLET, chain: "eip155:196" });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body.case_id).toBe(a.body.case_id);
    expect(instruments.businessLogicInvocations.valuate).toBe(1);
  });
  it("idempotency: same key + different body conflicts with 409", async () => {
    const { app } = buildApp({ provider: stubProvider, skipPayment: true });
    await request(app)
      .post("/v1/risk/valuate-wallet")
      .set("idempotency-key", "k2")
      .send({ wallet_address: WALLET, chain: "eip155:196" });
    const res = await request(app)
      .post("/v1/risk/valuate-wallet")
      .set("idempotency-key", "k2")
      .send({ wallet_address: SPENDER, chain: "eip155:196" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });
});

describe("demo endpoint", () => {
  it("is labelled as a demo", async () => {
    const { app } = buildApp({ provider: stubProvider, skipPayment: true });
    const res = await request(app)
      .post("/v1/risk/demo")
      .send({ wallet_address: WALLET, chain: "eip155:196" });
    expect(res.status).toBe(200);
    expect(res.body.demo).toBe(true);
    expect(res.body.note).toContain("DEMO");
  });
});
