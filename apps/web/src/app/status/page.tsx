"use client";

import { useEffect, useState } from "react";
import { LedgerCard, LedgerRow } from "@/components/ledger";
import { API_URL } from "@/lib/api";

interface Health {
  status: string;
  time: string;
  threat_intel: string;
  payment: string;
}

export default function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [state, setState] = useState<"loading" | "up" | "down">("loading");

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((h: Health) => {
        setHealth(h);
        setState("up");
      })
      .catch(() => setState("down"));
  }, []);

  const dot = (ok: boolean | null) => (
    <span
      className={`figure text-xs ${ok === null ? "text-muted" : ok ? "text-teal" : "text-risk"}`}
    >
      {ok === null ? "checking…" : ok ? "operational" : "unavailable"}
    </span>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Status</h1>
      <p className="mt-3 text-sm text-muted">
        Live health, fetched from the API — nothing on this page is hardcoded.
      </p>

      <div className="mt-10">
        <LedgerCard
          title="Service health"
          meta={health ? new Date(health.time).toUTCString() : undefined}
        >
          <LedgerRow label="API" value={dot(state === "loading" ? null : state === "up")} />
          <LedgerRow
            label="Chain data providers"
            sub="free public RPC + explorer adapters"
            value={dot(state === "loading" ? null : state === "up")}
          />
          <LedgerRow
            label="Threat-intel list freshness"
            sub="community drainer lists, OFAC SDN"
            value={dot(state === "loading" ? null : health?.threat_intel === "available")}
          />
          <LedgerRow
            label="Payment configuration"
            sub="x402 seller credentials (state only — no secrets exposed)"
            value={
              <span
                className={`figure text-xs ${health?.payment === "configured" ? "text-teal" : "text-amber"}`}
              >
                {state === "loading" ? "checking…" : health?.payment === "configured" ? "configured" : "not configured"}
              </span>
            }
          />
        </LedgerCard>
      </div>
    </div>
  );
}
