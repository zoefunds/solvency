# SOLVENCY — 90-second demo script (target 75–85s)

**0–8s** — Title card over the SOLVENCY ledger UI.
"An agent is about to tell its user their portfolio is worth $50,000. But is it, really?"

**8–17s** — Logo mark animates (line forks, rejoins thinner).
"This is SOLVENCY, a risk-adjusted valuation ASP for AI agents."

**17–28s** — Terminal: buyer agent (TradeSteward) preparing an approval tx.
"Our trading agent is about to sign an approval to an unfamiliar contract."

**28–38s** — Agent invokes the tool.
"Before signing, the agent calls SOLVENCY's simulate_transaction_risk service."

**38–50s** — Real curl/terminal output showing HTTP 402 + payment challenge.
"SOLVENCY is a paid A2MCP service. The endpoint returns 402 Payment Required."

**50–61s** — Agentic Wallet payment + replayed request succeeding.
"The agent's OKX Agentic Wallet handles payment on X Layer and the request continues."

**61–74s** — The structured finding, nominal vs risk-adjusted side by side.
"SOLVENCY reports that this transaction would expose $12,000 to a high-risk contract, and that the wallet's true Risk-Adjusted Net Worth is $31,000 — not $50,000."

**74–84s** — Agent output: reject_and_revoke consumed; no signature.
"The agent consumes the finding and does not sign."

**84–90s** — Wordmark.
"SOLVENCY. Your portfolio value, adjusted for how exposed it actually is."

Notes: all terminal output must be real captures (no fabricated hashes or payment states). The demo wallet is a fixed, labelled wallet; the paid endpoint runs the real engine against its real on-chain state.
