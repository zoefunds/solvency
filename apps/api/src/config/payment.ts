/**
 * Single source of truth for pricing and payment-network configuration.
 * The declared marketplace price for each tool MUST match these values.
 */

const DEFAULT_SIMULATION_PRICE_USD = 0.02;
const DEFAULT_VALUATION_PRICE_USD = 0.01;

function envPrice(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 10) {
    throw new Error(`${name} must be a number in (0, 10], got "${raw}"`);
  }
  return n;
}

export const PAYMENT_NETWORK = "eip155:196"; // X Layer mainnet — only network the OKX Payment SDK supports
export const SETTLEMENT_ASSET = {
  symbol: "USDT0",
  address: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
  decimals: 6,
} as const;

export const PRICES = {
  simulateTransaction: envPrice("PRICE_SIMULATE_USD", DEFAULT_SIMULATION_PRICE_USD),
  valuateWallet: envPrice("PRICE_VALUATE_USD", DEFAULT_VALUATION_PRICE_USD),
} as const;

export function priceString(usd: number): string {
  return `$${usd}`;
}

export interface PaymentEnv {
  okxApiKey: string;
  okxSecretKey: string;
  okxPassphrase: string;
  payTo: string;
}

/**
 * Validates payment credentials. In production, missing credentials are fatal —
 * there is no fake-facilitator fallback.
 */
export function loadPaymentEnv(): PaymentEnv | null {
  const payTo = process.env.PAY_TO ?? process.env.PAY_TO_ADDRESS ?? "";
  const env = {
    okxApiKey: process.env.OKX_API_KEY ?? "",
    okxSecretKey: process.env.OKX_SECRET_KEY ?? "",
    okxPassphrase: process.env.OKX_PASSPHRASE ?? "",
    payTo,
  };
  const missing = Object.entries(env)
    .filter(([, v]) => v === "")
    .map(([k]) => k);
  if (missing.length > 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Missing required payment environment variables: ${missing.join(", ")}. ` +
          `Refusing to start without real payment verification in production.`
      );
    }
    return null; // development: paid routes will refuse requests with 503, never silently free
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) {
    throw new Error("PAY_TO must be a valid 0x-prefixed EVM address");
  }
  return env;
}
