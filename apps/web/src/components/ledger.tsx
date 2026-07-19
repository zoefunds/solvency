import type { ReactNode } from "react";

export function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const TIER_COLOR: Record<string, string> = {
  verified_low_risk: "text-teal",
  safe_scoped: "text-teal",
  safe_to_sign: "text-teal",
  sign: "text-teal",
  high: "text-teal",
  unverified_contract: "text-amber",
  flagged_pattern_match: "text-amber",
  proceed_with_caution: "text-amber",
  high_value_at_risk: "text-amber",
  unlimited_low_risk: "text-amber",
  unlimited_high_risk: "text-amber",
  stale_unused: "text-amber",
  medium: "text-amber",
  low: "text-amber",
  insufficient_data: "text-amber",
  pause_and_reverify: "text-amber",
  sign_with_reduced_scope: "text-amber",
  request_more_information: "text-amber",
  known_exploit_history: "text-risk",
  active_drainer_signature: "text-risk",
  known_exploit_exposure: "text-risk",
  sanctioned_counterparty: "text-risk",
  do_not_sign: "text-risk",
  reject_and_revoke: "text-risk",
};

/** risk status is never colour-only: the canonical label is always printed */
export function RiskLabel({ value }: { value: string }) {
  return (
    <span className={`figure text-xs ${TIER_COLOR[value] ?? "text-muted"}`}>
      {value}
    </span>
  );
}

export function LedgerCard({
  title,
  meta,
  children,
  tone = "default",
}: {
  title?: string;
  meta?: string;
  children: ReactNode;
  tone?: "default" | "raised";
}) {
  return (
    <section
      className={`border border-hairline ${tone === "raised" ? "bg-surface" : "bg-ledger"} rounded-md`}
    >
      {(title || meta) && (
        <div className="flex items-baseline justify-between border-b border-hairline px-4 py-2.5">
          {title && (
            <h3 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              {title}
            </h3>
          )}
          {meta && <span className="figure text-xs text-muted">{meta}</span>}
        </div>
      )}
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

export function LedgerRow({
  label,
  value,
  sub,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline py-2 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-ink">{label}</div>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      </div>
      <div className="figure shrink-0 text-sm">{value}</div>
    </div>
  );
}

/** the two dollar figures, same size, same baseline, so the discount reads instantly */
export function NominalVsAdjusted({
  nominal,
  adjusted,
  confidence,
}: {
  nominal: number;
  adjusted: number;
  confidence: string;
}) {
  const close = nominal > 0 && adjusted / nominal >= 0.95;
  return (
    <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Nominal</div>
        <div className="figure text-3xl text-nominal sm:text-4xl">{usd(nominal)}</div>
      </div>
      <div aria-hidden="true" className="figure hidden text-2xl text-muted sm:block">
        →
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Risk-adjusted</div>
        <div className={`figure text-3xl sm:text-4xl ${close ? "text-teal" : "text-amber"}`}>
          {usd(adjusted)}
        </div>
      </div>
      <div className="self-end pb-1">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted">confidence </span>
        <RiskLabel value={confidence} />
      </div>
    </div>
  );
}

export function ExposureBand({
  contract,
  tier,
  status,
  value,
  reason,
}: {
  contract: string;
  tier: string;
  status: string;
  value: number;
  reason: string;
}) {
  return (
    <div className="border-l-2 border-hairline py-2 pl-3 data-[risk=high]:border-risk" data-risk={tier === "known_exploit_history" || tier === "active_drainer_signature" ? "high" : undefined}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <code className="figure text-xs text-ink">{contract}</code>
        <span className="figure text-sm text-ink">{usd(value)}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        <RiskLabel value={tier} />
        <RiskLabel value={status} />
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{reason}</p>
    </div>
  );
}
