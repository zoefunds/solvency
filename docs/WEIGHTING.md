# SOLVENCY Weighting Formula

The discount applied to each holding is deterministic. No language model ever produces the numbers. This document matches `apps/api/src/risk/weighting.ts` exactly; the same code runs in production and in the Wallet Lab demo.

## Formula

```
discount(holding, approval) = clamp( base(tier) × scope × staleness , 0 , 0.95 )
at_risk        = Σ per-holding min( Σ discounts , holding_value × 0.95 )
risk_adjusted  = max( nominal − at_risk , 0 )
```

## Base discount per contract risk tier

| tier | base discount |
|---|---|
| verified_low_risk | 0.00 |
| unverified_contract | 0.25 |
| flagged_pattern_match | 0.60 |
| known_exploit_history | 0.85 |
| active_drainer_signature | 0.95 |
| insufficient_data | 0.10 (conservative haircut, surfaced via confidence) |

## Multipliers

- **Scope** — unlimited approvals expose the full holding; capped approvals expose at most the allowance value; no approval → no discount.
- **Staleness** — approvals with no interaction for > 90 days: × 1.15.
- **Sanctions** — a sanctioned counterparty floors the discount at 0.90 regardless of tier.

## Compounding, floor and ceiling

Multiple exposures on the same holding sum, but the per-holding total is capped at 95% of the holding's value. A holding is never discounted below zero and the portfolio at-risk figure never exceeds nominal.

## Missing data

Missing data never silently means safety:
- chain provider failure → `insufficient_data` classification / lowered `valuation_confidence`, with an explicit limitation string;
- threat-intel list unavailable → affected classifications degrade to `insufficient_data`;
- missing price data → lowered confidence and a named limitation.

The formula is not tuned for dramatic demo numbers; the demo wallet runs through the identical code path as production.
