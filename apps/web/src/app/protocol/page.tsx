import { LedgerCard, LedgerRow } from "@/components/ledger";

export const metadata = { title: "Protocol — SOLVENCY" };

export default function ProtocolPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Protocol</h1>

      <div className="mt-10 space-y-8">
        <LedgerCard title="What SOLVENCY computes">
          <p className="text-sm leading-relaxed text-muted">
            Risk-Adjusted Net Worth: a wallet&apos;s nominal balance discounted by the
            exploit-risk of the contracts it has approved. For a proposed transaction, SOLVENCY
            additionally computes the dollar value that would become newly exposed if the
            transaction were signed.
          </p>
        </LedgerCard>

        <LedgerCard title="What SOLVENCY does not know">
          <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-muted">
            <li>It does not guarantee any contract is safe, and does not claim to detect every exploit.</li>
            <li>It covers the native asset and a curated set of major tokens; long-tail tokens are not yet priced.</li>
            <li>Threat-intel lists are third-party and can be wrong, stale or unavailable — matches are reported as pattern matches, never as confirmed malice.</li>
            <li>When data is missing, findings degrade to <code className="figure text-xs">insufficient_data</code> rather than assuming safety.</li>
          </ul>
        </LedgerCard>

        <LedgerCard title="Fact, signal, classification">
          <LedgerRow label="Observed on-chain fact" sub="balances, active approvals, contract bytecode presence" value={<span className="text-teal">verifiable</span>} />
          <LedgerRow label="Third-party threat-intel signal" sub="community drainer lists, OFAC SDN — recorded with source and freshness" value={<span className="text-amber">untrusted input</span>} />
          <LedgerRow label="Derived risk classification" sub="canonical enums: contract risk tier, exposure status, verdict" value={<span className="text-muted">deterministic</span>} />
          <LedgerRow label="Computed financial discount" sub="the weighting formula — never invented by a language model" value={<span className="text-muted">deterministic</span>} />
        </LedgerCard>

        <LedgerCard title="The weighting formula, in plain language">
          <p className="text-sm leading-relaxed text-muted">
            Each holding reachable by an approval is discounted by{" "}
            <code className="figure text-xs">base(risk&nbsp;tier) × scope × staleness</code>, capped
            at 95% of the holding. Unlimited approvals expose the full holding; capped approvals
            only up to the allowance. Approvals unused for more than 90 days carry a 1.15×
            staleness multiplier. Base discounts range from 0% (verified, low-risk) through 25%
            (unverified) and 60% (flagged pattern) to 85–95% (known exploit history / active
            drainer signature). Sanctioned counterparties floor at 90%. Multiple exposures on one
            holding never discount it below zero. Missing data lowers{" "}
            <code className="figure text-xs">valuation_confidence</code> instead of hiding risk.
            The full formula is documented in <code className="figure text-xs">docs/WEIGHTING.md</code>{" "}
            in the repository and is identical in production and in the Wallet Lab demo.
          </p>
        </LedgerCard>

        <LedgerCard title="Agent-first invocation and x402">
          <ol className="list-decimal space-y-1 pl-4 text-sm leading-relaxed text-muted">
            <li>The calling agent POSTs to a paid endpoint without payment credentials.</li>
            <li>SOLVENCY returns HTTP 402 with the standard OKX x402 payment challenge.</li>
            <li>The agent&apos;s OKX Agentic Wallet authorises payment in USDT0 on X Layer (eip155:196).</li>
            <li>The request is replayed with the payment credential; the OKX facilitator verifies and settles server-side.</li>
            <li>Only then does the valuation engine run; HTTP 200 returns the structured finding.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">
            Payment verification is exclusively server-side; the browser never decides a payment is valid.
          </p>
        </LedgerCard>

        <LedgerCard title="Downstream agent actions">
          <p className="text-sm leading-relaxed text-muted">
            Every finding carries one canonical recommendation the caller can consume without
            parsing prose:{" "}
            <code className="figure text-xs">
              sign · sign_with_reduced_scope · request_more_information · pause_and_reverify ·
              reject_and_revoke
            </code>
            . SOLVENCY provides the finding; the caller controls its own final action.
          </p>
        </LedgerCard>
      </div>
    </div>
  );
}
