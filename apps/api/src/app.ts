import express, { type Request, type Response, type NextFunction } from "express";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  paymentMiddlewareFromHTTPServer,
} from "@okxweb3/x402-express";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { PRICES, PAYMENT_NETWORK, SETTLEMENT_ASSET, priceString, loadPaymentEnv } from "./config/payment.js";
import { ValuationRequest, SimulationRequest, SCHEMA_VERSION } from "./risk/schemas.js";
import { valuateWallet, simulateTransaction } from "./risk/valuator.js";
import { PublicRpcProvider, SUPPORTED_CHAINS } from "./risk/chain-provider.js";
import { intelStatus } from "./risk/threat-intel.js";
import { errorBody } from "./lib/errors.js";
import { log } from "./lib/logger.js";
import { fingerprint, idemLookup, idemBegin, idemComplete, idemAbort } from "./lib/idempotency.js";
import { rateLimit, concurrencyGate } from "./lib/rate-limit.js";
import { z } from "zod";

export interface AppInstruments {
  /** incremented ONLY when the paid business logic actually runs — proves 402 gating */
  businessLogicInvocations: { simulate: number; valuate: number };
}

export function buildApp(opts?: { provider?: PublicRpcProvider; skipPayment?: boolean }): {
  app: express.Express;
  initialize: () => Promise<void>;
  instruments: AppInstruments;
} {
  const app = express();
  const provider = opts?.provider ?? new PublicRpcProvider();
  const instruments: AppInstruments = { businessLogicInvocations: { simulate: 0, valuate: 0 } };
  const gate = concurrencyGate(4);

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type, idempotency-key, x-payment, payment-signature");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    next();
  });
  app.options(/.*/, (_req, res) => void res.sendStatus(204));
  app.use(express.json({ limit: "64kb" }));

  // ---------- free endpoints ----------

  app.get("/health", rateLimit({ windowMs: 60_000, max: 60, name: "health" }), async (_req, res) => {
    const intel = await intelStatus();
    res.json({
      status: "ok",
      time: new Date().toISOString(),
      threat_intel: intel.available ? "available" : "degraded",
      payment: loadPaymentEnvSafe() ? "configured" : "not_configured",
    });
  });

  app.get("/v1/service", rateLimit({ windowMs: 60_000, max: 60, name: "service" }), (_req, res) => {
    res.json({
      name: "SOLVENCY",
      version: "1.0.0",
      schema_version: SCHEMA_VERSION,
      description:
        "risk-adjusted valuation for AI agents and the wallets they act on. before trusting a balance or signing a transaction, get the wallet's Risk-Adjusted Net Worth and a pre-signature exposure simulation, reported in dollars.",
      network: PAYMENT_NETWORK,
      settlement_asset: SETTLEMENT_ASSET.symbol,
      supported_analysis_chains: SUPPORTED_CHAINS,
      paid_endpoints: [
        {
          tool: "simulate_transaction_risk",
          method: "POST",
          path: "/v1/risk/simulate-transaction",
          price_usd: PRICES.simulateTransaction,
          description:
            "before signing a transaction, simulate its effect on wallet exposure and report the expected newly-exposed value in dollars, along with the target contract's risk classification. use immediately before an agent signs any approval, swap, or contract interaction.",
        },
        {
          tool: "get_risk_adjusted_valuation",
          method: "POST",
          path: "/v1/risk/valuate-wallet",
          price_usd: PRICES.valuateWallet,
          description:
            "compute a wallet's Risk-Adjusted Net Worth by discounting its nominal balance for exposure behind unlimited, stale or high-risk approvals. use before reporting or relying on a wallet balance figure.",
        },
      ],
      disclaimer:
        "SOLVENCY reports valuation risk, not investment advice, and does not guarantee a contract is safe. never submit private keys, seed phrases or other secrets — a public wallet address is the only credential needed.",
    });
  });

  app.get("/v1/schema/valuation", rateLimit({ windowMs: 60_000, max: 30, name: "schema" }), (_req, res) => {
    res.json({
      request: z.toJSONSchema(ValuationRequest),
      example_request: ValuationRequestExample,
    });
  });
  app.get("/v1/schema/simulation", rateLimit({ windowMs: 60_000, max: 30, name: "schema" }), (_req, res) => {
    res.json({
      request: z.toJSONSchema(SimulationRequest),
      example_request: SimulationRequestExample,
    });
  });

  // ---------- x402 payment protection ----------

  let initialize: () => Promise<void>;
  const paymentEnv = loadPaymentEnvSafe();
  if (paymentEnv && !opts?.skipPayment) {
    const facilitatorClient = new OKXFacilitatorClient({
      apiKey: paymentEnv.okxApiKey,
      secretKey: paymentEnv.okxSecretKey,
      passphrase: paymentEnv.okxPassphrase,
      syncSettle: true,
    });
    const resourceServer = new x402ResourceServer(facilitatorClient).register(
      PAYMENT_NETWORK,
      new ExactEvmScheme()
    );
    const httpServer = new x402HTTPResourceServer(resourceServer, {
      "POST /v1/risk/simulate-transaction": {
        accepts: {
          scheme: "exact",
          network: PAYMENT_NETWORK,
          payTo: paymentEnv.payTo,
          price: priceString(PRICES.simulateTransaction),
          maxTimeoutSeconds: 300,
        },
      },
      "POST /v1/risk/valuate-wallet": {
        accepts: {
          scheme: "exact",
          network: PAYMENT_NETWORK,
          payTo: paymentEnv.payTo,
          price: priceString(PRICES.valuateWallet),
          maxTimeoutSeconds: 300,
        },
      },
    });
    app.use((req, res, next) => {
      const gated = req.path === "/v1/risk/simulate-transaction" || req.path === "/v1/risk/valuate-wallet";
      if (gated) log("payment_gate_reached", { route: req.path, method: req.method });
      paymentMiddlewareFromHTTPServer(httpServer)(req, res, next);
    });
    initialize = async () => {
      await resourceServer.initialize();
      log("payment_initialized", { network: PAYMENT_NETWORK, payTo: paymentEnv.payTo });
    };
  } else {
    // No payment credentials: paid routes refuse with 503. Never silently free.
    if (!opts?.skipPayment) {
      app.use(["/v1/risk/simulate-transaction", "/v1/risk/valuate-wallet"], (_req, res) => {
        res
          .status(503)
          .json(
            errorBody(
              "PAYMENT_NOT_CONFIGURED",
              "payment credentials are not configured on this instance; the paid service is unavailable",
              true
            )
          );
      });
    }
    initialize = async () => {
      log("payment_skipped", { reason: opts?.skipPayment ? "test_mode" : "missing_credentials" });
    };
  }

  // ---------- paid business logic (only reachable after payment middleware) ----------

  const paidHandler =
    (kind: "simulate" | "valuate") => async (req: Request, res: Response) => {
      const t0 = Date.now();
      const route = kind === "simulate" ? "/v1/risk/simulate-transaction" : "/v1/risk/valuate-wallet";
      const schema = kind === "simulate" ? SimulationRequest : ValuationRequest;
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const isAddr = first?.path.includes("wallet_address");
        res.status(422).json(
          errorBody(
            isAddr ? "INVALID_WALLET_ADDRESS" : "INVALID_TRANSACTION_INPUT",
            `${first?.path.join(".")}: ${first?.message}`,
            false
          )
        );
        return;
      }
      if (!SUPPORTED_CHAINS.includes(parsed.data.chain)) {
        res.status(422).json(
          errorBody("UNSUPPORTED_CHAIN", `chain must be one of: ${SUPPORTED_CHAINS.join(", ")}`, false)
        );
        return;
      }

      const idemKey = req.header("idempotency-key");
      const fp = idemKey ? fingerprint(route, parsed.data) : "";
      if (idemKey) {
        const { hit, conflict } = idemLookup(idemKey, fp);
        if (conflict) {
          res.status(409).json(
            errorBody("IDEMPOTENCY_CONFLICT", "this Idempotency-Key was already used with a different request body", false)
          );
          return;
        }
        if (hit && !hit.pending) {
          log("idempotent_replay", { route, status: hit.status });
          res.status(hit.status).json(hit.body);
          return;
        }
        idemBegin(idemKey, fp);
      }

      if (!gate.enter()) {
        if (idemKey) idemAbort(idemKey);
        res.status(429).json(errorBody("RATE_LIMITED", "service is at capacity; retry shortly", true));
        return;
      }

      try {
        instruments.businessLogicInvocations[kind]++;
        log("business_logic_reached", { route, kind });
        const head = await provider.getHeadBlock(parsed.data.chain);
        const result =
          kind === "simulate"
            ? await simulateTransaction(provider, parsed.data as SimulationRequest, head)
            : await valuateWallet(provider, parsed.data as ValuationRequest, head);
        if (idemKey) idemComplete(idemKey, fp, 200, result);
        log("request_completed", { route, latency_ms: Date.now() - t0, case_id: result.case_id });
        res.status(200).json(result);
      } catch (err) {
        if (idemKey) idemAbort(idemKey);
        const msg = err instanceof Error ? err.message : "unknown";
        const code = msg === "CHAIN_PROVIDER_UNAVAILABLE" ? "CHAIN_PROVIDER_UNAVAILABLE" : "INTERNAL_ERROR";
        log("request_failed", { route, code, latency_ms: Date.now() - t0 });
        res.status(code === "CHAIN_PROVIDER_UNAVAILABLE" ? 503 : 500).json(
          errorBody(code, code === "CHAIN_PROVIDER_UNAVAILABLE" ? "upstream chain data providers are unavailable" : "an internal error occurred", true)
        );
      } finally {
        gate.leave();
      }
    };

  app.post("/v1/risk/simulate-transaction", paidHandler("simulate"));
  app.post("/v1/risk/valuate-wallet", paidHandler("valuate"));

  // ---------- free demo (clearly labelled, strictly rate-limited) ----------

  app.post(
    "/v1/risk/demo",
    rateLimit({ windowMs: 60_000, max: 5, name: "demo" }),
    async (req, res) => {
      const parsed = ValuationRequest.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json(errorBody("INVALID_WALLET_ADDRESS", "demo requires a valid wallet_address and chain", false));
        return;
      }
      if (!SUPPORTED_CHAINS.includes(parsed.data.chain)) {
        res.status(422).json(errorBody("UNSUPPORTED_CHAIN", `chain must be one of: ${SUPPORTED_CHAINS.join(", ")}`, false));
        return;
      }
      if (!gate.enter()) {
        res.status(429).json(errorBody("RATE_LIMITED", "service is at capacity; retry shortly", true));
        return;
      }
      try {
        const result = await valuateWallet(provider, parsed.data, null);
        res.json({ demo: true, note: "DEMO SIMULATION — free rate-limited demonstration of the same engine used by the paid endpoints", ...result });
      } catch {
        res.status(503).json(errorBody("CHAIN_PROVIDER_UNAVAILABLE", "upstream chain data providers are unavailable", true));
      } finally {
        gate.leave();
      }
    }
  );

  app.use((_req, res) => void res.status(404).json(errorBody("INTERNAL_ERROR", "not found", false)));
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const tooLarge = "type" in (err as any) && (err as any).type === "entity.too.large";
    log("unhandled_error", { name: err.name, too_large: tooLarge });
    res
      .status(tooLarge ? 413 : 500)
      .json(errorBody(tooLarge ? "REQUEST_TOO_LARGE" : "INTERNAL_ERROR", tooLarge ? "request body exceeds the 64kb limit" : "an internal error occurred", false));
  });

  return { app, initialize, instruments };
}

function loadPaymentEnvSafe() {
  try {
    return loadPaymentEnv();
  } catch {
    return null;
  }
}

const ValuationRequestExample = {
  wallet_address: "0x0000000000000000000000000000000000000001",
  chain: "eip155:196",
  valuation_depth: "holdings_plus_approvals",
};
const SimulationRequestExample = {
  wallet_address: "0x0000000000000000000000000000000000000001",
  chain: "eip155:196",
  proposed_transaction: {
    to: "0x0000000000000000000000000000000000000002",
    data: "0x095ea7b3...",
    decoded_intent: "approval",
  },
};
