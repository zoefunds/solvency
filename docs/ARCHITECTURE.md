# SOLVENCY Architecture

## Agent → SOLVENCY paid call

```mermaid
sequenceDiagram
    participant B as Buyer Agent
    participant W as OKX Agentic Wallet (TEE)
    participant F as OKX x402 Facilitator
    participant M as SOLVENCY payment middleware
    participant R as SOLVENCY risk API

    B->>M: POST /v1/risk/simulate-transaction (no payment)
    M-->>B: 402 Payment Required + challenge
    B->>W: interpret challenge, request payment
    W->>W: sign payment credential (key never leaves TEE)
    B->>M: replay request + X-PAYMENT credential
    M->>F: verify & settle (USDT0, eip155:196)
    F-->>M: settlement confirmed
    M->>R: request reaches business logic
    R-->>B: 200 structured risk finding
```

## Valuation engine

```mermaid
flowchart LR
    IN[validated request\nzod schemas] --> CP[ChainDataProvider]
    CP -->|balances| PR[pricing source\ncoins.llama.fi]
    CP -->|approval history| EX[explorer adapters\nBlockscout / OKLink]
    CP -->|allowances| MC[Multicall3 batch]
    TI[threat-intel provider\nMEW darklist · ScamSniffer · OFAC] --> CL[classifier]
    CP --> CL
    CL --> WE[deterministic weighting engine]
    PR --> WE
    WE --> VS[response schema validator] --> OUT[structured finding]
```

## Trust boundaries

```mermaid
flowchart TB
    subgraph untrusted[Untrusted external data]
        RPC[public RPC endpoints]
        EXP[explorer APIs]
        TIL[threat-intel lists]
        PRC[price API]
    end
    subgraph service[SOLVENCY]
        VAL[input validation & size caps]
        ENG[bounded fan-out, timeouts, retries]
        CLS[classification only — list content never reaches executable paths or HTML]
    end
    RPC --> ENG
    EXP --> ENG
    TIL --> CLS
    PRC --> ENG
    VAL --> ENG
```

Key properties:
- payment verification is server-side only (OKX facilitator); the browser never decides a payment is valid
- unpaid requests never reach chain-data or valuation code (instrumented: `payment_gate_reached` vs `business_logic_reached` log events)
- RPC/explorer URLs are service-configured; caller-supplied URLs are never accepted
- missing external data degrades to `insufficient_data`, never to false-safe
- in-memory idempotency and rate limiting are single-instance; a multi-instance deployment must use a shared store (documented limitation)
