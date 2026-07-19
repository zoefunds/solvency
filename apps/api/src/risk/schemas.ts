import { z } from "zod";

export const SCHEMA_VERSION = "1.0";

// ---------- canonical enums ----------

export const ExposureStatus = z.enum([
  "safe_scoped",
  "unlimited_low_risk",
  "unlimited_high_risk",
  "stale_unused",
  "known_exploit_exposure",
  "sanctioned_counterparty",
]);
export type ExposureStatus = z.infer<typeof ExposureStatus>;

export const ContractRiskTier = z.enum([
  "verified_low_risk",
  "unverified_contract",
  "flagged_pattern_match",
  "known_exploit_history",
  "active_drainer_signature",
  "insufficient_data",
]);
export type ContractRiskTier = z.infer<typeof ContractRiskTier>;

export const ValuationConfidence = z.enum(["high", "medium", "low", "insufficient_data"]);
export type ValuationConfidence = z.infer<typeof ValuationConfidence>;

export const SimulationVerdict = z.enum([
  "safe_to_sign",
  "proceed_with_caution",
  "high_value_at_risk",
  "do_not_sign",
  "insufficient_data",
]);
export type SimulationVerdict = z.infer<typeof SimulationVerdict>;

export const ExposureAttribution = z.enum([
  "unlimited_approval_pattern",
  "stale_forgotten_approval",
  "known_drainer_contract",
  "unverified_new_contract",
  "sanctioned_address_interaction",
  "multiple_factors",
  "insufficient_evidence",
  "no_material_exposure",
]);
export type ExposureAttribution = z.infer<typeof ExposureAttribution>;

export const RecommendedAgentAction = z.enum([
  "sign",
  "sign_with_reduced_scope",
  "request_more_information",
  "pause_and_reverify",
  "reject_and_revoke",
]);
export type RecommendedAgentAction = z.infer<typeof RecommendedAgentAction>;

// ---------- request schemas ----------

const evmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 40-hex-char EVM address");

const chainId = z
  .string()
  .regex(/^eip155:\d{1,10}$/, "must be a CAIP-2 EVM chain id, e.g. eip155:196");

const metadata = z
  .record(z.string().max(64), z.string().max(256))
  .refine((m) => Object.keys(m).length <= 16, "metadata may hold at most 16 keys")
  .optional();

export const ValuationRequest = z
  .object({
    wallet_address: evmAddress,
    chain: chainId,
    valuation_depth: z.enum(["holdings_only", "holdings_plus_approvals"]).default("holdings_plus_approvals"),
    metadata,
  })
  .strict();
export type ValuationRequest = z.infer<typeof ValuationRequest>;

export const SimulationRequest = z
  .object({
    wallet_address: evmAddress,
    chain: chainId,
    proposed_transaction: z
      .object({
        to: evmAddress,
        data: z
          .string()
          .regex(/^0x[0-9a-fA-F]*$/, "must be a hex string")
          .max(20_000, "calldata exceeds the 20,000-character limit")
          .optional(),
        value: z.string().regex(/^\d{1,40}$/, "must be a decimal wei string").optional(),
        decoded_intent: z.enum(["approval", "transfer", "swap", "unknown"]).optional(),
      })
      .strict(),
    metadata,
  })
  .strict();
export type SimulationRequest = z.infer<typeof SimulationRequest>;

// ---------- response schemas ----------

export const ExposureFinding = z.object({
  contract_address: z.string(),
  contract_risk_tier: ContractRiskTier,
  exposure_status: ExposureStatus,
  exposed_value_usd: z.number().min(0),
  reason: z.string(),
});
export type ExposureFinding = z.infer<typeof ExposureFinding>;

const base = {
  schema_version: z.literal(SCHEMA_VERSION),
  case_id: z.string().regex(/^sv_[0-9A-Za-z]+$/),
  status: z.enum(["completed", "failed"]),
  created_at: z.string(),
  wallet_address: z.string(),
  chain: z.string(),
  nominal_value_usd: z.number().min(0),
  risk_adjusted_net_worth_usd: z.number().min(0),
  valuation_confidence: ValuationConfidence,
  summary: z.string(),
  recommended_agent_action: RecommendedAgentAction,
  exposure_findings: z.array(ExposureFinding),
  limitations: z.array(z.string()),
};

export const ValuationResponse = z.object({
  ...base,
  analysis_type: z.literal("wallet_valuation"),
  exposure_attribution: z.object({
    primary: ExposureAttribution,
    contributing_factors: z.array(ExposureAttribution),
    reason: z.string(),
  }),
});
export type ValuationResponse = z.infer<typeof ValuationResponse>;

export const SimulationResponse = z.object({
  ...base,
  analysis_type: z.literal("pre_signature_simulation"),
  target_contract_risk: ContractRiskTier,
  exposure_status: ExposureStatus,
  newly_exposed_value_usd: z.number().min(0),
  simulation_verdict: SimulationVerdict,
});
export type SimulationResponse = z.infer<typeof SimulationResponse>;
