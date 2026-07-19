# SOLVENCY — Build Plan

Risk-adjusted valuation ASP for the OKX.AI Genesis Hackathon. Paid A2MCP service on X Layer mainnet (eip155:196), settled in USDT0 via the official OKX Payment SDK (x402).

## Verified facts (from official docs, 2026-07-19)
- OKX Payment SDK (`@okxweb3/x402-express` / `x402-core` / `x402-evm`) supports **X Layer mainnet `eip155:196` only**; default token USDT0 `0x779ded0c9e1022225f8e0630b35a9b54be713736` (6 decimals). Testnet (eip155:1952) is NOT supported by the SDK, so payment testing happens against mainnet with tiny prices.
- Required env: `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`, `PAY_TO` (SELLER.md uses `PAY_TO`; we accept `PAY_TO_ADDRESS` as an alias).
- Express flow: `OKXFacilitatorClient` → `x402ResourceServer.register("eip155:196", new ExactEvmScheme())` → `x402HTTPResourceServer` route map → `paymentMiddlewareFromHTTPServer` → `await resourceServer.initialize()` after listen.
- A2MCP listing requires a public HTTPS endpoint; unpaid `curl -i` must return HTTP 402 with the standard challenge.
- Hackathon Google form deadline: **Jul 27 2026, 23:59 UTC** (per OKX-Intro.md; Solvency.md's Jul 17 date is stale). Marketplace review ≤ 2 business days — list early.

## Architecture
- `apps/api` — Express + TypeScript. Paid endpoints `POST /v1/risk/simulate-transaction` ($0.02) and `POST /v1/risk/valuate-wallet` ($0.01), x402-protected. Free: `/health`, `/v1/service`, `/v1/schema/*`, rate-limited `/v1/risk/demo`.
- `src/risk/*` — chain provider adapters (free public RPC via viem + free-tier explorer), threat-intel ingestion (public drainer/exploit lists), deterministic weighting engine, zod schemas.
- `apps/web` — Next.js 15 App Router site (/, /interface, /wallet-lab, /findings, /protocol, /status). Ledger-reconciliation design language per brief.
- MCP-compatible tool surface: `simulate_transaction_risk`, `get_risk_adjusted_valuation`.

## Phases
1. ✅ Inspect env, git init, install Onchain OS skills, read SELLER.md + A2MCP docs
2. Agentic Wallet email login (needs user OTP) → record public EVM address → PAY_TO
3. Schemas, chain provider, threat-intel, weighting engine + unit tests
4. x402 endpoints via official SDK; unpaid-402 tests
5. Paid flow test with Agentic Wallet on X Layer mainnet (tiny price)
6. MCP tool interface
7. Website + original SVG logo
8. Security/a11y audit; tests, lint, typecheck, prod build
9. Deploy publicly (HTTPS); external verification
10. Register A2MCP ASP + list on OKX.AI
11. Demo script, X post, submission docs
12. Publish + Google form

## Needed from the user (will ask when the flow is waiting)
- Email OTP during Agentic Wallet login
- OKX developer API credentials if not obtainable via the authenticated workflow
- Deployment platform authorisation (e.g. Vercel/Railway login)
- X post publishing authorisation
- Google form completion
