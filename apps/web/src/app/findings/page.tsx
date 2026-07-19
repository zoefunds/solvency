import { LedgerCard, NominalVsAdjusted, ExposureBand, RiskLabel } from "@/components/ledger";

export const metadata = { title: "Sample Findings — SOLVENCY" };

const samples = [
  {
    id: "SAMPLE CASE — pre-signature simulation",
    caseId: "sv_SAMPLE0000000000000000A",
    nominal: 50000,
    adjusted: 31000,
    confidence: "high",
    verdict: "do_not_sign",
    action: "reject_and_revoke",
    summary:
      "this transaction would grant unlimited spend access to a contract matching a known exploit pattern, worth $12,000 of current holdings",
    findings: [
      {
        contract: "0x8a3f…exploit-pattern-match",
        tier: "known_exploit_history",
        status: "unlimited_high_risk",
        value: 12000,
        reason:
          "unlimited USDT0 approval requested; spender matches known threat-intel pattern (community-drainer-list)",
      },
      {
        contract: "0x41bc…stale-approval",
        tier: "unverified_contract",
        status: "stale_unused",
        value: 7000,
        reason: "unlimited approval; not used in over 180 days; source verification could not be established",
      },
    ],
  },
  {
    id: "SAMPLE CASE — wallet valuation",
    caseId: "sv_SAMPLE0000000000000000B",
    nominal: 12400,
    adjusted: 12150,
    confidence: "medium",
    verdict: null,
    action: "pause_and_reverify",
    summary:
      "nominal value $12,400 with approximately $250 exposed through a capped approval to an unverified contract",
    findings: [
      {
        contract: "0x9c1d…unverified-router",
        tier: "unverified_contract",
        status: "safe_scoped",
        value: 250,
        reason: "capped approval; spender's source verification could not be established",
      },
    ],
  },
];

export default function FindingsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Findings</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Example reports in the exact layout an agent-facing finding uses. These are labelled
        samples for illustration — not real customers and not real wallets belonging to real
        users.
      </p>

      <div className="mt-10 space-y-8">
        {samples.map((s) => (
          <LedgerCard key={s.caseId} title={s.id} meta={s.caseId}>
            <NominalVsAdjusted nominal={s.nominal} adjusted={s.adjusted} confidence={s.confidence} />
            <p className="mt-4 text-sm leading-relaxed text-muted">{s.summary}</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
              {s.verdict && (
                <div>
                  <span className="text-[11px] uppercase tracking-[0.18em] text-muted">verdict </span>
                  <RiskLabel value={s.verdict} />
                </div>
              )}
              <div>
                <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                  recommended action{" "}
                </span>
                <RiskLabel value={s.action} />
              </div>
            </div>
            <div className="mt-6 space-y-3 border-t border-hairline pt-4">
              {s.findings.map((f, i) => (
                <ExposureBand
                  key={i}
                  contract={f.contract}
                  tier={f.tier}
                  status={f.status}
                  value={f.value}
                  reason={f.reason}
                />
              ))}
            </div>
          </LedgerCard>
        ))}
      </div>
    </div>
  );
}
