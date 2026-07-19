"use client";

import { useState } from "react";
import { LedgerCard, NominalVsAdjusted, ExposureBand, RiskLabel } from "@/components/ledger";
import { API_URL } from "@/lib/api";

interface DemoResult {
  demo: boolean;
  case_id: string;
  created_at: string;
  nominal_value_usd: number;
  risk_adjusted_net_worth_usd: number;
  valuation_confidence: string;
  summary: string;
  recommended_agent_action: string;
  exposure_findings: {
    contract_address: string;
    contract_risk_tier: string;
    exposure_status: string;
    exposed_value_usd: number;
    reason: string;
  }[];
  limitations: string[];
}

export default function WalletLab() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("eip155:1");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<DemoResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    setError("");
    try {
      const res = await fetch(`${API_URL}/v1/risk/demo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet_address: address.trim(), chain }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? `request failed (${res.status})`);
        setState("error");
        return;
      }
      setResult(body as DemoResult);
      setState("done");
    } catch {
      setError("could not reach the SOLVENCY API");
      setState("error");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Wallet Lab</h1>
        <span className="figure rounded border border-amber/40 px-2 py-0.5 text-[11px] uppercase tracking-widest text-amber">
          demo simulation
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        A free, rate-limited demonstration of the same valuation engine behind the paid agent
        endpoints — live balances, live approval history, live threat-intel. The paid production
        service is called by agents through the x402 payment flow, not this console.
      </p>
      <p className="mt-2 max-w-2xl text-xs text-muted">
        Enter a public wallet address only. Never enter a private key, seed phrase or any secret.
      </p>

      <form onSubmit={run} className="mt-8 flex max-w-2xl flex-wrap gap-3">
        <label className="sr-only" htmlFor="wallet">
          Public wallet address
        </label>
        <input
          id="wallet"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x…"
          pattern="0x[0-9a-fA-F]{40}"
          required
          className="figure min-w-64 flex-1 rounded-md border border-hairline bg-surface px-3 py-2.5 text-sm placeholder:text-muted"
        />
        <label className="sr-only" htmlFor="chain">
          Chain
        </label>
        <select
          id="chain"
          value={chain}
          onChange={(e) => setChain(e.target.value)}
          className="figure rounded-md border border-hairline bg-surface px-3 py-2.5 text-sm"
        >
          <option value="eip155:1">eip155:1 — Ethereum</option>
          <option value="eip155:196">eip155:196 — X Layer</option>
        </select>
        <button
          type="submit"
          disabled={state === "loading"}
          className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {state === "loading" ? "Reconciling…" : "Run valuation"}
        </button>
      </form>

      {state === "error" && (
        <p role="alert" className="figure mt-6 text-sm text-risk">
          {error}
        </p>
      )}

      {state === "done" && result && (
        <div className="mt-10 space-y-6">
          <LedgerCard
            title="Risk-adjusted valuation"
            meta={`${result.case_id} · ${new Date(result.created_at).toUTCString()}`}
          >
            <NominalVsAdjusted
              nominal={result.nominal_value_usd}
              adjusted={result.risk_adjusted_net_worth_usd}
              confidence={result.valuation_confidence}
            />
            <p className="mt-4 text-sm leading-relaxed text-muted">{result.summary}</p>
            <div className="mt-3">
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
                recommended agent action{" "}
              </span>
              <RiskLabel value={result.recommended_agent_action} />
            </div>
          </LedgerCard>

          {result.exposure_findings.length > 0 && (
            <LedgerCard title="Exposure findings" meta={`${result.exposure_findings.length} shown`}>
              <div className="space-y-3">
                {result.exposure_findings.map((f, i) => (
                  <ExposureBand
                    key={i}
                    contract={f.contract_address}
                    tier={f.contract_risk_tier}
                    status={f.exposure_status}
                    value={f.exposed_value_usd}
                    reason={f.reason}
                  />
                ))}
              </div>
            </LedgerCard>
          )}

          {result.limitations.length > 0 && (
            <LedgerCard title="Limitations">
              <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted">
                {result.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </LedgerCard>
          )}
        </div>
      )}
    </div>
  );
}
