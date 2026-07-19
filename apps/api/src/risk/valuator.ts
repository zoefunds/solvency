import { ulid } from "ulid";
import type { ChainDataProvider, Approval, Balance } from "./chain-provider.js";
import { getPricesUsd, usdValue } from "./chain-provider.js";
import { checkAddress, intelStatus } from "./threat-intel.js";
import {
  weighExposure,
  aggregate,
  overallConfidence,
  round2,
  STALE_THRESHOLD_DAYS,
} from "./weighting.js";
import {
  ValuationResponse,
  SimulationResponse,
  SCHEMA_VERSION,
  type ContractRiskTier,
  type ExposureFinding,
  type ExposureAttribution,
  type ValuationRequest,
  type SimulationRequest,
} from "./schemas.js";

export function newCaseId(): string {
  return `sv_${ulid()}`;
}

const OVERALL_TIMEOUT_MS = 25_000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("CHAIN_PROVIDER_UNAVAILABLE")), OVERALL_TIMEOUT_MS)
    ),
  ]);
}

async function classifyContract(
  provider: ChainDataProvider,
  address: string,
  chain: string
): Promise<{ tier: ContractRiskTier; sanctioned: boolean; intelSources: string[]; limitations: string[] }> {
  const limitations: string[] = [];
  const intel = await checkAddress(address);
  if (!intel.state.available) {
    limitations.push("threat-intel lists were unavailable; classification degraded to insufficient_data");
    return { tier: "insufficient_data", sanctioned: false, intelSources: [], limitations };
  }
  if (intel.state.failedSources.length > 0) {
    limitations.push(`threat-intel sources unavailable: ${intel.state.failedSources.join(", ")}`);
  }
  let meta;
  try {
    meta = await provider.getContractMetadata(address, chain);
  } catch {
    limitations.push("contract metadata could not be retrieved");
    return {
      tier: "insufficient_data",
      sanctioned: intel.sanctioned,
      intelSources: intel.sources,
      limitations,
    };
  }
  let tier: ContractRiskTier;
  if (intel.matched && !intel.sanctioned) tier = "known_exploit_history";
  else if (!meta.isContract) tier = "insufficient_data"; // EOA spender — unusual, cannot assess as a contract
  else if (!meta.verificationKnown) tier = "unverified_contract";
  else tier = meta.verified ? "verified_low_risk" : "unverified_contract";
  if (!meta.verificationKnown && meta.isContract) {
    limitations.push(
      "source-code verification status was not available from a free explorer tier; contract treated as unverified"
    );
  }
  return { tier, sanctioned: intel.sanctioned, intelSources: intel.sources, limitations };
}

interface Ctx {
  balances: Balance[];
  prices: Map<string, number>;
  nominal: number;
  balancesPartial: boolean;
  priceMissing: string[];
  limitations: string[];
}

async function loadPortfolio(provider: ChainDataProvider, wallet: string, chain: string): Promise<Ctx> {
  const { balances, partial } = await withTimeout(provider.getBalances(wallet, chain));
  const { prices, missing } = await getPricesUsd(chain, balances);
  let nominal = 0;
  for (const b of balances) {
    const p = prices.get(b.token);
    if (p !== undefined) nominal += usdValue(b, p);
  }
  const limitations: string[] = [];
  if (partial) limitations.push("some balance lookups failed; nominal value may be understated");
  if (missing.length > 0) limitations.push(`no price data for: ${missing.join(", ")}`);
  limitations.push(
    "balances cover the native asset and a curated set of major tokens; long-tail tokens are not yet included"
  );
  return { balances, prices, nominal: round2(nominal), balancesPartial: partial, priceMissing: missing, limitations };
}

function blocksToDays(blockDelta: bigint, chain: string): number {
  const secPerBlock = chain === "eip155:1" ? 12 : 3;
  return Number(blockDelta) * secPerBlock / 86_400;
}

export async function valuateWallet(
  provider: ChainDataProvider,
  req: ValuationRequest,
  headBlock: bigint | null
): Promise<ValuationResponse> {
  const ctx = await loadPortfolio(provider, req.wallet_address, req.chain);
  const findings: ExposureFinding[] = [];
  const attributions = new Set<ExposureAttribution>();
  const perHolding = new Map<string, { holdingUsd: number; discounts: number[] }>();
  let approvalsPartial = false;
  let anyInsufficient = false;
  const limitations = [...ctx.limitations];

  for (const b of ctx.balances) {
    const p = ctx.prices.get(b.token);
    perHolding.set(b.token, { holdingUsd: p !== undefined ? usdValue(b, p) : 0, discounts: [] });
  }

  if (req.valuation_depth === "holdings_plus_approvals") {
    const { approvals, partial } = await withTimeout(provider.getApprovals(req.wallet_address, req.chain));
    approvalsPartial = partial;
    if (req.chain === "eip155:196" && !process.env.OKLINK_API_KEY) {
      limitations.push(
        "X Layer approval history currently covers approximately the last two weeks of blocks; older approvals may not be included"
      );
    }
    if (partial)
      limitations.push("approval history could not be fully read; exposure may be understated — treat as insufficient_data, not safety");

    for (const a of approvals) {
      const holding = perHolding.get(a.token);
      const holdingUsd = holding?.holdingUsd ?? 0;
      const cls = await classifyContract(provider, a.spender, req.chain);
      limitations.push(...cls.limitations.filter((l) => !limitations.includes(l)));
      if (cls.tier === "insufficient_data") anyInsufficient = true;

      const price = ctx.prices.get(a.token);
      const cappedUsd =
        !a.unlimited && price !== undefined
          ? Math.min(usdValue({ ...a, amount: a.allowance, decimals: tokenDecimals(ctx.balances, a.token), symbol: a.tokenSymbol, token: a.token }, price), holdingUsd)
          : holdingUsd;
      const exposedUsd = a.unlimited ? holdingUsd : cappedUsd;

      const ageDays = headBlock ? blocksToDays(headBlock - a.lastSeenBlock, req.chain) : null;
      const w = weighExposure({
        tier: cls.tier,
        scope: a.unlimited ? "unlimited" : "capped",
        ageDays,
        sanctioned: cls.sanctioned,
        exposedValueUsd: exposedUsd,
      });
      holding?.discounts.push(w.discountedUsd);

      const material =
        w.discountedUsd > 0 ||
        cls.tier === "known_exploit_history" ||
        cls.tier === "active_drainer_signature" ||
        cls.sanctioned;
      if (material) {
        findings.push({
          contract_address: a.spender,
          contract_risk_tier: cls.tier,
          exposure_status: w.status,
          exposed_value_usd: w.discountedUsd,
          reason: reasonFor(a, cls.tier, ageDays, cls.intelSources),
        });
        attributions.add(attributionFor(w.status, cls.tier));
      }
    }
  }

  const { atRiskUsd, riskAdjustedUsd } = aggregate(ctx.nominal, perHolding);
  const intel = await intelStatus();
  const confidence = overallConfidence({
    priceDataMissing: ctx.priceMissing.length > 0,
    threatIntelUnavailable: !intel.available,
    chainDataPartial: ctx.balancesPartial || approvalsPartial,
    anyInsufficientTier: anyInsufficient,
  });

  const primary: ExposureAttribution =
    attributions.size === 0
      ? approvalsPartial
        ? "insufficient_evidence"
        : "no_material_exposure"
      : attributions.size === 1
        ? [...attributions][0]!
        : "multiple_factors";

  const body = {
    schema_version: SCHEMA_VERSION,
    case_id: newCaseId(),
    status: "completed" as const,
    created_at: new Date().toISOString(),
    analysis_type: "wallet_valuation" as const,
    wallet_address: req.wallet_address.toLowerCase(),
    chain: req.chain,
    nominal_value_usd: ctx.nominal,
    risk_adjusted_net_worth_usd: riskAdjustedUsd,
    valuation_confidence: confidence,
    exposure_findings: findings.sort((a, b) => b.exposed_value_usd - a.exposed_value_usd).slice(0, 10),
    exposure_attribution: {
      primary,
      contributing_factors: [...attributions].filter((a) => a !== primary),
      reason:
        attributions.size === 0
          ? "no active approvals produced a material discount against current holdings"
          : "the listed approvals discount the holdings they can reach, per the documented weighting formula",
    },
    summary:
      atRiskUsd > 0
        ? `nominal value $${ctx.nominal.toLocaleString()} with approximately $${atRiskUsd.toLocaleString()} exposed through active approvals; risk-adjusted net worth $${riskAdjustedUsd.toLocaleString()} (confidence: ${confidence})`
        : `nominal value $${ctx.nominal.toLocaleString()} with no material approval exposure detected (confidence: ${confidence})`,
    recommended_agent_action:
      atRiskUsd === 0
        ? ("sign" as const)
        : atRiskUsd / Math.max(ctx.nominal, 1) > 0.25
          ? ("reject_and_revoke" as const)
          : ("pause_and_reverify" as const),
    limitations,
  };
  return ValuationResponse.parse(body);
}

export async function simulateTransaction(
  provider: ChainDataProvider,
  req: SimulationRequest,
  headBlock: bigint | null
): Promise<SimulationResponse> {
  const ctx = await loadPortfolio(provider, req.wallet_address, req.chain);
  const decoded = decodeIntent(req);
  // for an approval the party gaining power is the spender inside the calldata,
  // not the token contract the tx is sent to
  const target = decoded.kind === "approval" && decoded.spender ? decoded.spender : req.proposed_transaction.to;
  const cls = await classifyContract(provider, target, req.chain);
  const limitations = [...ctx.limitations, ...cls.limitations];
  // conservative model: an approval exposes the full holding of the approved token
  // (or, if the token cannot be determined, the largest single holding)
  let newlyExposed = 0;
  if (decoded.kind === "approval") {
    const token = decoded.token ?? largestHolding(ctx);
    const holdingUsd = token ? holdingValue(ctx, token) : 0;
    const w = weighExposure({
      tier: cls.tier,
      scope: decoded.unlimited ? "unlimited" : "capped",
      ageDays: 0,
      sanctioned: cls.sanctioned,
      exposedValueUsd: holdingUsd,
    });
    newlyExposed = w.discountedUsd;
  } else if (decoded.kind === "transfer" || decoded.kind === "unknown") {
    const valueWei = req.proposed_transaction.value ? BigInt(req.proposed_transaction.value) : 0n;
    const nativePrice = ctx.prices.get("native") ?? 0;
    const sent = (Number(valueWei) / 1e18) * nativePrice;
    const w = weighExposure({
      tier: cls.tier,
      scope: sent > 0 ? "capped" : "none",
      ageDays: 0,
      sanctioned: cls.sanctioned,
      exposedValueUsd: sent,
    });
    newlyExposed = round2(sent > 0 ? Math.max(w.discountedUsd, cls.tier === "verified_low_risk" ? 0 : sent * 0.1) : 0);
    if (decoded.kind === "unknown")
      limitations.push("calldata could not be decoded to a known intent; exposure estimate is conservative");
  }

  const riskAdjusted = round2(Math.max(ctx.nominal - newlyExposed, 0));
  const intel = await intelStatus();
  const confidence = overallConfidence({
    priceDataMissing: ctx.priceMissing.length > 0,
    threatIntelUnavailable: !intel.available,
    chainDataPartial: ctx.balancesPartial,
    anyInsufficientTier: cls.tier === "insufficient_data",
  });

  const exposureStatus = weighExposure({
    tier: cls.tier,
    scope: decoded.kind === "approval" ? (decoded.unlimited ? "unlimited" : "capped") : "capped",
    ageDays: 0,
    sanctioned: cls.sanctioned,
    exposedValueUsd: Math.max(newlyExposed, 0.01),
  }).status;

  const verdict =
    cls.tier === "insufficient_data" && newlyExposed === 0
      ? ("insufficient_data" as const)
      : cls.tier === "known_exploit_history" || cls.tier === "active_drainer_signature" || cls.sanctioned
        ? ("do_not_sign" as const)
        : newlyExposed > 0.25 * Math.max(ctx.nominal, 1)
          ? ("high_value_at_risk" as const)
          : newlyExposed > 0
            ? ("proceed_with_caution" as const)
            : ("safe_to_sign" as const);

  const action =
    verdict === "do_not_sign"
      ? ("reject_and_revoke" as const)
      : verdict === "high_value_at_risk"
        ? ("pause_and_reverify" as const)
        : verdict === "insufficient_data"
          ? ("request_more_information" as const)
          : verdict === "proceed_with_caution"
            ? ("sign_with_reduced_scope" as const)
            : ("sign" as const);

  const body = {
    schema_version: SCHEMA_VERSION,
    case_id: newCaseId(),
    status: "completed" as const,
    created_at: new Date().toISOString(),
    analysis_type: "pre_signature_simulation" as const,
    wallet_address: req.wallet_address.toLowerCase(),
    chain: req.chain,
    target_contract_risk: cls.tier,
    exposure_status: exposureStatus,
    nominal_value_usd: ctx.nominal,
    newly_exposed_value_usd: newlyExposed,
    risk_adjusted_net_worth_usd: riskAdjusted,
    valuation_confidence: confidence,
    simulation_verdict: verdict,
    summary: summariseSimulation(verdict, newlyExposed, cls.tier, cls.intelSources, confidence),
    recommended_agent_action: action,
    exposure_findings:
      newlyExposed > 0
        ? [
            {
              contract_address: target.toLowerCase(),
              contract_risk_tier: cls.tier,
              exposure_status: exposureStatus,
              exposed_value_usd: newlyExposed,
              reason: `signing would newly expose approximately $${newlyExposed.toLocaleString()} to this contract`,
            },
          ]
        : [],
    limitations,
  };
  return SimulationResponse.parse(body);
}

// ---------- helpers ----------

const APPROVE_SELECTOR = "0x095ea7b3";
const UNLIMITED_HEX_PREFIX = /^f{16,}/;

function decodeIntent(req: SimulationRequest): { kind: "approval" | "transfer" | "swap" | "unknown"; token?: string; spender?: string; unlimited: boolean } {
  const tx = req.proposed_transaction;
  const data = tx.data ?? "0x";
  if (tx.decoded_intent === "approval" || data.startsWith(APPROVE_SELECTOR)) {
    const spenderHex = data.length >= 10 + 64 ? data.slice(10 + 24, 10 + 64) : "";
    const amountHex = data.length >= 10 + 128 ? data.slice(10 + 64, 10 + 128).replace(/^0+/, "") : "";
    return {
      kind: "approval",
      token: tx.to.toLowerCase(), // approve() is called ON the token
      spender: /^[0-9a-f]{40}$/i.test(spenderHex) ? `0x${spenderHex}`.toLowerCase() : undefined,
      unlimited: amountHex === "" ? true : UNLIMITED_HEX_PREFIX.test(amountHex) || amountHex.length >= 32,
    };
  }
  if (tx.decoded_intent === "transfer") return { kind: "transfer", unlimited: false };
  if (tx.decoded_intent === "swap") return { kind: "swap", unlimited: false };
  if (data === "0x") return { kind: "transfer", unlimited: false };
  return { kind: "unknown", unlimited: false };
}

function largestHolding(ctx: Ctx): string | null {
  let best: string | null = null;
  let bestUsd = 0;
  for (const b of ctx.balances) {
    const p = ctx.prices.get(b.token);
    const v = p !== undefined ? usdValue(b, p) : 0;
    if (v > bestUsd) {
      bestUsd = v;
      best = b.token;
    }
  }
  return best;
}

function holdingValue(ctx: Ctx, token: string): number {
  const b = ctx.balances.find((x) => x.token === token.toLowerCase() || x.token === token);
  if (!b) return 0;
  const p = ctx.prices.get(b.token);
  return p !== undefined ? round2(usdValue(b, p)) : 0;
}

function tokenDecimals(balances: Balance[], token: string): number {
  return balances.find((b) => b.token === token)?.decimals ?? 18;
}

function reasonFor(a: Approval, tier: ContractRiskTier, ageDays: number | null, sources: string[]): string {
  const parts: string[] = [];
  parts.push(a.unlimited ? `unlimited ${a.tokenSymbol} approval` : `capped ${a.tokenSymbol} approval`);
  if (ageDays !== null && ageDays > STALE_THRESHOLD_DAYS)
    parts.push(`not used in over ${Math.floor(ageDays)} days`);
  if (tier === "known_exploit_history")
    parts.push(`spender matches known threat-intel pattern (${sources.join(", ")})`);
  else if (tier === "unverified_contract") parts.push("spender's source verification could not be established");
  else if (tier === "insufficient_data") parts.push("available data does not establish the safety of this spender");
  return parts.join("; ");
}

function attributionFor(status: string, tier: ContractRiskTier): ExposureAttribution {
  if (status === "sanctioned_counterparty") return "sanctioned_address_interaction";
  if (tier === "known_exploit_history" || tier === "active_drainer_signature") return "known_drainer_contract";
  if (status === "stale_unused") return "stale_forgotten_approval";
  if (tier === "unverified_contract") return "unverified_new_contract";
  if (status === "unlimited_high_risk" || status === "unlimited_low_risk") return "unlimited_approval_pattern";
  return "insufficient_evidence";
}

function summariseSimulation(
  verdict: string,
  newlyExposed: number,
  tier: ContractRiskTier,
  sources: string[],
  confidence: string
): string {
  const tierText =
    tier === "known_exploit_history"
      ? `the target matches a known threat-intel pattern (${sources.join(", ")})`
      : tier === "unverified_contract"
        ? "the target contract's source verification could not be established"
        : tier === "insufficient_data"
          ? "the available data does not establish the safety of the target"
          : "no adverse signal was found for the target";
  return `${tierText}; signing would newly expose approximately $${newlyExposed.toLocaleString()} (verdict: ${verdict}, confidence: ${confidence})`;
}
