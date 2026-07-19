import Link from "next/link";
import { LedgerCard, NominalVsAdjusted } from "@/components/ledger";

const FLOW = [
  "AGENT",
  "WALLET OR TRANSACTION",
  "402 PAYMENT REQUIRED",
  "AGENTIC WALLET",
  "PAID",
  "EXPOSURE ANALYSIS",
  "RISK-ADJUSTED FINDING",
  "AGENT DECIDES",
];

const SAMPLE = `{
  "schema_version": "1.0",
  "case_id": "sv_01KXX6XMPL3XAMPLE",
  "status": "completed",
  "analysis_type": "pre_signature_simulation",
  "target_contract_risk": "known_exploit_history",
  "exposure_status": "unlimited_high_risk",
  "nominal_value_usd": 50000,
  "newly_exposed_value_usd": 12000,
  "risk_adjusted_net_worth_usd": 31000,
  "valuation_confidence": "high",
  "simulation_verdict": "do_not_sign",
  "summary": "this transaction would grant unlimited spend access to a contract matching a known exploit pattern, worth $12,000 of current holdings",
  "recommended_agent_action": "reject_and_revoke"
}`;

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* hero */}
      <section className="py-20 sm:py-28">
        <p className="figure text-xs text-muted">risk-adjusted valuation for the agent economy</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          YOUR PORTFOLIO, ADJUSTED FOR HOW EXPOSED IT ACTUALLY IS
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
          Before an agent trusts a balance or signs a transaction, SOLVENCY reports how much of
          that value is really at risk — in dollars, not a warning label.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/interface"
            className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90"
          >
            VIEW AGENT INTERFACE
          </Link>
          <Link
            href="/wallet-lab"
            className="rounded-md border border-hairline px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            RUN DEMO WALLET
          </Link>
        </div>
      </section>

      <div className="ledger-rule" />

      {/* the discount, read instantly */}
      <section className="py-16">
        <LedgerCard title="What another agent reads" meta="sample case">
          <NominalVsAdjusted nominal={50000} adjusted={31000} confidence="high" />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            A wallet&apos;s nominal balance is not what it can actually rely on. Part of it sits
            behind approvals to contracts that are unverified, stale, or match known drainer
            patterns. SOLVENCY prices that exposure and returns one machine-readable figure:{" "}
            <span className="text-ink">Risk-Adjusted Net Worth</span>.
          </p>
        </LedgerCard>
      </section>

      {/* flow */}
      <section className="py-8">
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          The call, end to end
        </h2>
        <ol className="mt-6 flex flex-wrap items-center gap-y-3">
          {FLOW.map((step, i) => (
            <li key={step} className="flex items-center">
              <span
                className={`figure rounded border border-hairline px-3 py-1.5 text-xs ${
                  step === "402 PAYMENT REQUIRED"
                    ? "text-amber"
                    : step === "RISK-ADJUSTED FINDING"
                      ? "text-teal"
                      : "text-ink"
                } bg-surface`}
              >
                {step}
              </span>
              {i < FLOW.length - 1 && (
                <span aria-hidden="true" className="px-2 text-muted">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* sample JSON */}
      <section className="py-16">
        <LedgerCard title="Structured finding" meta="application/json">
          <pre className="figure overflow-x-auto text-xs leading-relaxed text-ink">
            <code>{SAMPLE}</code>
          </pre>
        </LedgerCard>
        <p className="mt-4 text-xs text-muted">
          SOLVENCY reports valuation risk, not investment advice, and does not guarantee a
          contract is safe. The caller controls its own final action.
        </p>
      </section>

      {/* two tools */}
      <section className="grid gap-4 py-8 sm:grid-cols-2">
        <LedgerCard title="simulate_transaction_risk" meta="$0.02 / call">
          <p className="text-sm leading-relaxed text-muted">
            Before signing, simulate a transaction&apos;s effect on wallet exposure. Returns the
            expected newly-exposed dollar value and the target contract&apos;s risk classification.
          </p>
        </LedgerCard>
        <LedgerCard title="get_risk_adjusted_valuation" meta="$0.01 / call">
          <p className="text-sm leading-relaxed text-muted">
            Before reporting a balance, compute the wallet&apos;s Risk-Adjusted Net Worth —
            nominal value discounted for unlimited, stale or high-risk approvals.
          </p>
        </LedgerCard>
      </section>
    </div>
  );
}
