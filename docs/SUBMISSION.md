# SOLVENCY — Hackathon submission record

Deadline: Google form by **27 Jul 2026, 23:59 UTC**. ASP must pass OKX.AI review and be live.

| field | value |
|---|---|
| project name | SOLVENCY |
| one-line | risk-adjusted valuation for AI agents and the wallets they act on |
| ASP listing name | SOLVENCY |
| ASP live status | ✅ live — "Listed — eligible for task recommendations" (approved as of 2026-07-25) |
| ASP identifier | #6728 (create tx 0x10c18ecf84d2fcf676d9722475bd651a1ae94802a5b7b6facb4ccfdc260fb900) |
| service type | A2MCP |
| category | Finance / on-chain risk |
| production endpoints | https://solvency-api.fly.dev/v1/risk/simulate-transaction · https://solvency-api.fly.dev/v1/risk/valuate-wallet |
| website | https://solvency-web.fly.dev |
| GitHub repository | https://github.com/zoefunds/solvency |
| X post | ⏳ (docs/X_POST.md, publish after live) |
| demo in X post | ⏳ (≤90s, docs/DEMO_SCRIPT.md) |
| Agentic Wallet receiving address | 0x870c912f6fe56bdd731e2978420ac2c895564da1 |
| payment network | eip155:196 (X Layer mainnet), USDT0 |
| x402 prices | $0.02 simulate · $0.01 valuate (must match listing exactly) |
| technical summary | Express/TS x402 seller (official @okxweb3 SDK) + deterministic risk engine (viem, Blockscout/OKLink, Multicall3, MEW/ScamSniffer/OFAC intel, llama.fi pricing) + Next.js 15 site |
| real integrations | a2mcp · x402 · OKX Payment SDK · Agentic Wallet (buyer test) · X Layer |
| security summary | server-side payment verification; unpaid calls provably never reach valuation logic; strict input validation; bounded external fan-out; secret redaction; no false-safe degradation |
| submission date | ⏳ pending final X post + Google form (target: before 2026-07-27 23:59 UTC) |

## Pre-listing checklist (from build brief)
- [x] both endpoints public HTTPS and callable
- [x] unpaid calls return real 402 on both
- [x] paid flow demonstrated on both with Agentic Wallet (see PAYMENT_EVIDENCE.md)
- [x] payTo = intended Agentic Wallet address
- [x] listing prices match endpoint prices (0.02 / 0.01 USDT)
- [x] health endpoint works externally
- [x] no secrets in git (verified 2026-07-25: only `.env.example` tracked, no live credentials found in history) · README accurate · samples labelled · no fake data anywhere
- [x] ASP passed marketplace review and is live (2026-07-25)
- [ ] 90-second demo video recorded
- [ ] X post published with #OKXAI (after demo video is ready)
- [ ] Google form submitted
