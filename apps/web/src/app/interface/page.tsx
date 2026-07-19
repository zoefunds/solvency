import { LedgerCard, LedgerRow } from "@/components/ledger";
import { API_URL } from "@/lib/api";

export const metadata = { title: "Agent Interface — SOLVENCY" };

const tools = [
  {
    name: "simulate_transaction_risk",
    price: "$0.02 per call",
    method: "POST",
    path: "/v1/risk/simulate-transaction",
    description:
      "before signing a transaction, simulate its effect on wallet exposure and report the expected newly-exposed value in dollars, along with the target contract's risk classification. use immediately before an agent signs any approval, swap, or contract interaction.",
    required: [
      ["wallet_address", "0x-prefixed EVM address"],
      ["chain", "CAIP-2 id — eip155:196 or eip155:1"],
      ["proposed_transaction.to", "target contract address"],
    ],
    optional: [
      ["proposed_transaction.data", "hex calldata (max 20,000 chars)"],
      ["proposed_transaction.value", "decimal wei string"],
      ["proposed_transaction.decoded_intent", "approval | transfer | swap | unknown"],
      ["metadata", "up to 16 short string entries"],
    ],
    example: `{
  "wallet_address": "0xYourWallet…",
  "chain": "eip155:196",
  "proposed_transaction": {
    "to": "0xTargetContract…",
    "data": "0x095ea7b3…",
    "decoded_intent": "approval"
  }
}`,
  },
  {
    name: "get_risk_adjusted_valuation",
    price: "$0.01 per call",
    method: "POST",
    path: "/v1/risk/valuate-wallet",
    description:
      "compute a wallet's Risk-Adjusted Net Worth by discounting its nominal balance for exposure behind unlimited, stale or high-risk approvals. use before reporting or relying on a wallet balance figure.",
    required: [
      ["wallet_address", "0x-prefixed EVM address"],
      ["chain", "CAIP-2 id — eip155:196 or eip155:1"],
    ],
    optional: [
      ["valuation_depth", "holdings_only | holdings_plus_approvals (default)"],
      ["metadata", "up to 16 short string entries"],
    ],
    example: `{
  "wallet_address": "0xYourWallet…",
  "chain": "eip155:196",
  "valuation_depth": "holdings_plus_approvals"
}`,
  },
];

export default function InterfacePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Agent interface</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        SOLVENCY is an agent-first paid A2MCP service. Both tools are x402-protected: an unpaid
        call returns HTTP 402 with a standard payment challenge; the calling agent&apos;s OKX
        Agentic Wallet settles in USDT0 on X Layer (eip155:196) and the request is replayed.
        Idempotency is supported via the <code className="figure text-xs">Idempotency-Key</code>{" "}
        header.
      </p>

      <div className="mt-10 space-y-8">
        {tools.map((t) => (
          <LedgerCard key={t.name} title={t.name} meta={t.price}>
            <p className="text-sm leading-relaxed text-muted">{t.description}</p>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div>
                <LedgerRow label="Method / endpoint" value={`${t.method} ${t.path}`} />
                <LedgerRow label="Network" value="eip155:196 (X Layer)" />
                <LedgerRow label="Settlement" value="USDT0" />
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Required parameters
                  </h4>
                  {t.required.map(([k, v]) => (
                    <LedgerRow key={k} label={<code className="figure text-xs">{k}</code>} value={<span className="text-muted">{v}</span>} />
                  ))}
                  <h4 className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Optional parameters
                  </h4>
                  {t.optional.map(([k, v]) => (
                    <LedgerRow key={k} label={<code className="figure text-xs">{k}</code>} value={<span className="text-muted">{v}</span>} />
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Example request body
                  </h4>
                  <pre className="figure mt-2 overflow-x-auto rounded border border-hairline bg-bg p-3 text-xs leading-relaxed">
                    <code>{t.example}</code>
                  </pre>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    See the 402 challenge
                  </h4>
                  <pre className="figure mt-2 overflow-x-auto rounded border border-hairline bg-bg p-3 text-xs leading-relaxed">
                    <code>{`curl -si -X POST ${API_URL}${t.path} \\
  -H 'content-type: application/json' \\
  -d '${t.example.replace(/\n\s*/g, " ")}'
# → HTTP/1.1 402 Payment Required`}</code>
                  </pre>
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted">
              Response schema:{" "}
              <a className="figure underline decoration-hairline underline-offset-4 hover:text-ink" href={`${API_URL}/v1/schema/${t.name === "simulate_transaction_risk" ? "simulation" : "valuation"}`}>
                GET /v1/schema/{t.name === "simulate_transaction_risk" ? "simulation" : "valuation"}
              </a>
            </p>
          </LedgerCard>
        ))}
      </div>
    </div>
  );
}
