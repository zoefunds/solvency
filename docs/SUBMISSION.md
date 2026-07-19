# SOLVENCY — Hackathon submission record

Deadline: Google form by **27 Jul 2026, 23:59 UTC**. ASP must pass OKX.AI review and be live.

| field | value |
|---|---|
| project name | SOLVENCY |
| one-line | risk-adjusted valuation for AI agents and the wallets they act on |
| ASP listing name | SOLVENCY |
| ASP live status | ⏳ pending registration |
| ASP identifier | ⏳ |
| service type | A2MCP |
| category | Finance / on-chain risk |
| production endpoints | ⏳ https://<deploy-domain>/v1/risk/simulate-transaction · /v1/risk/valuate-wallet |
| website | ⏳ |
| GitHub repository | ⏳ |
| X post | ⏳ (docs/X_POST.md, publish after live) |
| demo in X post | ⏳ (≤90s, docs/DEMO_SCRIPT.md) |
| Agentic Wallet receiving address | ⏳ (public EVM address only) |
| payment network | eip155:196 (X Layer mainnet), USDT0 |
| x402 prices | $0.02 simulate · $0.01 valuate (must match listing exactly) |
| technical summary | Express/TS x402 seller (official @okxweb3 SDK) + deterministic risk engine (viem, Blockscout/OKLink, Multicall3, MEW/ScamSniffer/OFAC intel, llama.fi pricing) + Next.js 15 site |
| real integrations | a2mcp · x402 · OKX Payment SDK · Agentic Wallet (buyer test) · X Layer |
| security summary | server-side payment verification; unpaid calls provably never reach valuation logic; strict input validation; bounded external fan-out; secret redaction; no false-safe degradation |
| submission date | ⏳ |

## Pre-listing checklist (from build brief)
- [ ] both endpoints public HTTPS and callable
- [ ] unpaid calls return real 402 on both
- [ ] paid flow demonstrated on both with Agentic Wallet
- [ ] payTo = intended Agentic Wallet address
- [ ] listing prices match endpoint prices
- [ ] health endpoint works externally
- [ ] no secrets in git · README accurate · samples labelled · no fake data anywhere
