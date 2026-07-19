export type ErrorCode =
  | "INVALID_WALLET_ADDRESS"
  | "INVALID_TRANSACTION_INPUT"
  | "REQUEST_TOO_LARGE"
  | "CHAIN_PROVIDER_UNAVAILABLE"
  | "THREAT_INTEL_UNAVAILABLE"
  | "VALUATION_OUTPUT_INVALID"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_VERIFICATION_FAILED"
  | "PAYMENT_NOT_CONFIGURED"
  | "UNSUPPORTED_CHAIN"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export function errorBody(code: ErrorCode, message: string, retryable: boolean) {
  return { error: { code, message, retryable } };
}
