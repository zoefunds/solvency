# Payment verification evidence (sanitised)

Production endpoint: https://solvency-api.fly.dev · network eip155:196 · asset USDT0
Payer + payee (self-test): Agentic Wallet `0x870c912f6fe56bdd731e2978420ac2c895564da1`
Date: 2026-07-19

## TEST A — unpaid request returns 402 (both endpoints)
`curl -s -o /dev/null -w "%{http_code}" -X POST https://solvency-api.fly.dev/v1/risk/simulate-transaction …` → **402**
`… /v1/risk/valuate-wallet …` → **402**
`PAYMENT-REQUIRED` header decodes to x402Version 2, scheme `exact`, network `eip155:196`, asset `0x779ded0c9e1022225f8e0630b35a9b54be713736`, amounts `20000` / `10000` (=$0.02 / $0.01, 6 decimals), payTo `0x870c912f6fe56bdd731e2978420ac2c895564da1`, resource URL = production endpoint.

## TEST B — business logic not reached when unpaid
Server logs show `payment_gate_reached` with no `business_logic_reached` for unpaid calls; covered by automated test "without credentials paid routes … business logic is NOT reached" and by instrumentation counters.

## TEST C/D — paid flow via Agentic Wallet (Onchain OS `payment quote` → `pay`)
simulate-transaction ($0.02): status **success**, settlement tx
`0x60f41cb2bd0cb49c8e851faaa37e6ddaebb0c468870dbe12c6e76480f6cea80d`
→ HTTP 200, case `sv_01KXXT2J7Q2FNCFG9132C5FK1J`, schema-valid finding.

valuate-wallet ($0.01): status **success**, settlement tx
`0xb3d288961659af933affc7b69af98ade00a4dbc79154eced1716077b9c87ccac`
→ HTTP 200, case `sv_01KXXTJDDKT28VAF3YY1VMFG84`, schema-valid finding.

Receipts decoded via the official SDK/CLI (`decodedReceipt.status: success`, payer confirmed). No credentials or OTPs appear in this file.

## TEST E — idempotency
Covered by automated tests: same `Idempotency-Key` + same body replays the cached result (business logic executed once); same key + different body → 409 `IDEMPOTENCY_CONFLICT`.
