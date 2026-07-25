# X participation post (publish only after ASP is live; all lowercase, no em dashes)

ASP is live: #6728, "Listed, eligible for task recommendations" (approved 2026-07-25).

---

your agent is about to tell you your portfolio is worth $50,000. is it, really?

introducing solvency, a paid agent service provider live on okx.ai.

most of a wallet's balance sits behind token approvals nobody ever reviews. some of those approvals are unlimited. some point at unverified contracts. some match known drainer patterns. that is real financial exposure, and almost nothing prices it in dollars, it just gets flagged as a warning your agent has no way to act on.

solvency does something different: it computes risk adjusted net worth, your nominal balance discounted for exactly how much of it is exposed to the contracts you have approved. before an ai agent trusts a balance or signs a transaction, it calls solvency and gets the answer back as one number it can act on, not a security alert it has to interpret.

two callable tools:
- get_risk_adjusted_valuation, $0.01/call, reports what a wallet is actually worth right now
- simulate_transaction_risk, $0.02/call, reports what a proposed approval would newly expose before you sign it

every call is paid per use through x402, so an unpaid request gets a 402 payment required and never touches the valuation engine. the calling agent's okx agentic wallet settles the charge in usdt0 on x layer, then the request replays and the finding comes back as structured json: nominal value, risk adjusted value, confidence, exposure findings, and a recommended action (sign, sign with reduced scope, pause and reverify, reject and revoke).

the numbers are not model generated. balances and approvals come from live on chain reads, approvals get cross referenced against public exploit and drainer intel lists, and the discount is a deterministic formula documented in the repo, not a language model guessing a scary number. when data is missing, solvency says so instead of assuming safety.

built entirely on okx infrastructure:
- a2mcp for agent callable service delivery
- x402 with the official okx payment sdk for pay per call billing
- okx agentic wallet for autonomous buyer side payment (tee signed, key never exposed)
- x layer mainnet for settlement in usdt0
- okx.ai for asp registration and marketplace listing

solvency is live now at solvency-api.fly.dev, with a public interface and demo console at solvency-web.fly.dev. code is open at github.com/zoefunds/solvency.

demo below.

#OKXAI

---

(attach the ≤90s demo video before publishing; verify every claim above against the live deployment first)
