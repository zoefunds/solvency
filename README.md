# SOLVENCY

Risk-adjusted valuation for the agent economy — a paid A2MCP agent service on OKX.AI.

## Problem

A wallet's nominal balance is not what it can actually rely on. Part of that balance sits behind approvals granted to contracts that are unverified, stale, or match known drainer patterns. That exposure is real financial risk, but almost nothing reports it as a financial number. Agents get security *alerts*; they need a *valuation*.

## What SOLVENCY computes

**Risk-Adjusted Net Worth** — nominal balance discounted by the exploit-risk of the contracts the wallet has approved — and, for a proposed transaction, the dollar value that would become **newly exposed** if it were signed. Findings are machine-readable; another agent consumes them without parsing prose.

SOLVENCY does not custody funds, execute transactions, give investment advice, guarantee a contract is safe, or claim to detect every exploit.

## How it works

1. Agent POSTs to a paid endpoint → HTTP **402** with the standard OKX x402 challenge
2. The agent's **OKX Agentic Wallet** authorises payment (USDT0 on **X Layer**, `eip155:196`)
3. Request replayed with payment credential → verified server-side by the **OKX facilitator** (official `@okxweb3/x402-*` Payment SDK)
4. Only then does the engine run: live balances (viem, free public RPC), approval history (Blockscout / OKLink free tiers), current allowances (Multicall3), threat-intel cross-reference (MEW darklist, ScamSniffer, OFAC SDN), pricing (coins.llama.fi)
5. HTTP **200** with a schema-validated structured finding

## A2MCP interface

| tool | method / endpoint | price |
|---|---|---|
| `simulate_transaction_risk` | `POST /v1/risk/simulate-transaction` | $0.02 / call |
| `get_risk_adjusted_valuation` | `POST /v1/risk/valuate-wallet` | $0.01 / call |

Free endpoints: `GET /health`, `GET /v1/service`, `GET /v1/schema/{valuation,simulation}`, and a strictly rate-limited, clearly-labelled `POST /v1/risk/demo`.

Request/response schemas: served live at `/v1/schema/*`; canonical definitions in `apps/api/src/risk/schemas.ts`. Idempotency via the `Idempotency-Key` header (same key + same body replays; same key + different body → 409).

## Weighting formula

`discount = clamp(base(tier) × scope × staleness, 0, 0.95)` — deterministic, documented in [docs/WEIGHTING.md](docs/WEIGHTING.md), identical in production and demo. Missing data degrades to `insufficient_data`, never to false-safe. Architecture and trust boundaries: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository

```
apps/api   Express + TS — x402 seller, risk engine, 23 tests
apps/web   Next.js 15 — product site + Wallet Lab demo console
docs/      weighting, architecture, demo script, submission
```

## Local development

```bash
cd apps/api && npm i && npm run dev     # API on :4000
cd apps/web && npm i && npm run dev     # site on :3000
npm test / npm run typecheck            # in apps/api
```

## Environment

See `apps/api/.env.example`. Required in production: `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`, `PAY_TO` (Agentic Wallet public receiving address). Optional: `OKLINK_API_KEY` (X Layer approval history), price overrides, RPC overrides. Production refuses to start without payment credentials — there is no fake-facilitator fallback. All secret-bearing env files are gitignored.

## Payment network

X Layer mainnet (`eip155:196`), settled in USDT0 (`0x779d…3736`, 6 decimals). The official OKX Payment SDK supports mainnet only, so testing uses tiny real prices on mainnet.

## Security model

- server-side-only payment verification; unpaid requests provably never reach chain-data or valuation code (instrumented in logs)
- strict zod validation before any external call; size caps; bounded external fan-out and timeouts
- caller-supplied RPC/explorer URLs are never accepted
- threat-intel list content only influences classification fields — never executable paths or HTML
- structured logs with explicit secret redaction; no OTP/credential is ever stored

## Threat-intel sourcing and limitations

Lists are third-party, unauthenticated, and can be wrong, stale or unavailable: matches are reported as *pattern matches* with named sources, never "confirmed malicious". List failure degrades classification to `insufficient_data`. Balance coverage is native + curated major tokens; contract source verification uses free explorer tiers and is treated as *unverified* when unavailable.

## Privacy and retention

SOLVENCY needs only a public wallet address. Never submit private keys, seed phrases, passwords, OTP codes or any secret. Findings can reveal a wallet's holdings; operational data retained is minimal (case id, wallet address, chain, timestamps, canonical figures) with idempotency records expiring after 10 minutes. Raw RPC payloads are not persisted.

## Demo scenario

See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) — TradeSteward, a trading agent, simulates an approval to an unfamiliar router before signing, pays via Agentic Wallet, and declines to sign based on the finding.

## Submission

See [docs/SUBMISSION.md](docs/SUBMISSION.md) for the OKX.AI Genesis Hackathon checklist and verified details.
