import type { ContractRiskTier, ExposureStatus, ValuationConfidence } from "./schemas.js";

/**
 * Deterministic discount formula. Documented in docs/WEIGHTING.md — keep in sync.
 *
 * discount(holding) = clamp( base(tier) × scope × staleness , 0, 0.95 )
 * risk_adjusted = nominal − Σ holding_value × discount
 *
 * Missing data never produces a discount of 0 silently — it produces
 * `insufficient_data` confidence and an explicit limitation instead.
 */

export const BASE_DISCOUNT: Record<ContractRiskTier, number> = {
  verified_low_risk: 0.0,
  unverified_contract: 0.25,
  flagged_pattern_match: 0.6,
  known_exploit_history: 0.85,
  active_drainer_signature: 0.95,
  insufficient_data: 0.1, // conservative haircut, surfaced via confidence, never hidden
};

/** unlimited approvals expose the full balance; capped approvals only the cap. */
export const SCOPE_MULTIPLIER = { unlimited: 1.0, capped: 1.0, none: 0.0 } as const;

/** approvals unused for >90 days are more likely forgotten; risk compounds slightly. */
export const STALENESS_MULTIPLIER = { fresh: 1.0, stale: 1.15 } as const;

export const DISCOUNT_CEILING = 0.95;
export const STALE_THRESHOLD_DAYS = 90;

export interface ExposureInput {
  tier: ContractRiskTier;
  scope: keyof typeof SCOPE_MULTIPLIER;
  /** days since last interaction with the approved contract; null = unknown */
  ageDays: number | null;
  sanctioned: boolean;
  /** USD value of the holding reachable through this approval */
  exposedValueUsd: number;
}

export interface WeightedExposure {
  discountFraction: number;
  discountedUsd: number;
  status: ExposureStatus;
}

export function weighExposure(e: ExposureInput): WeightedExposure {
  if (e.scope === "none" || e.exposedValueUsd <= 0) {
    return { discountFraction: 0, discountedUsd: 0, status: "safe_scoped" };
  }
  const stale = e.ageDays !== null && e.ageDays > STALE_THRESHOLD_DAYS;
  let d = BASE_DISCOUNT[e.tier] * SCOPE_MULTIPLIER[e.scope] * (stale ? STALENESS_MULTIPLIER.stale : 1);
  if (e.sanctioned) d = Math.max(d, 0.9);
  d = Math.min(Math.max(d, 0), DISCOUNT_CEILING);

  let status: ExposureStatus;
  if (e.sanctioned) status = "sanctioned_counterparty";
  else if (e.tier === "known_exploit_history" || e.tier === "active_drainer_signature")
    status = "known_exploit_exposure";
  else if (e.scope === "unlimited" && d >= 0.5) status = "unlimited_high_risk";
  else if (e.scope === "unlimited" && stale) status = "stale_unused";
  else if (e.scope === "unlimited") status = "unlimited_low_risk";
  else if (stale) status = "stale_unused";
  else status = "safe_scoped";

  return {
    discountFraction: d,
    discountedUsd: round2(e.exposedValueUsd * d),
    status,
  };
}

/**
 * Multiple exposures on the same holding do not stack past the holding's value:
 * per-holding total discount is capped at DISCOUNT_CEILING × holding value.
 */
export function aggregate(
  nominalUsd: number,
  perHolding: Map<string, { holdingUsd: number; discounts: number[] }>
): { atRiskUsd: number; riskAdjustedUsd: number } {
  let atRisk = 0;
  for (const { holdingUsd, discounts } of perHolding.values()) {
    const total = Math.min(
      discounts.reduce((a, b) => a + b, 0),
      holdingUsd * DISCOUNT_CEILING
    );
    atRisk += total;
  }
  atRisk = round2(Math.min(atRisk, nominalUsd));
  return { atRiskUsd: atRisk, riskAdjustedUsd: round2(Math.max(nominalUsd - atRisk, 0)) };
}

export function overallConfidence(flags: {
  priceDataMissing: boolean;
  threatIntelUnavailable: boolean;
  chainDataPartial: boolean;
  anyInsufficientTier: boolean;
}): ValuationConfidence {
  if (flags.chainDataPartial && flags.priceDataMissing) return "insufficient_data";
  if (flags.chainDataPartial || flags.threatIntelUnavailable) return "low";
  if (flags.priceDataMissing || flags.anyInsufficientTier) return "medium";
  return "high";
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
