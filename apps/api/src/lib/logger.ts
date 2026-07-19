/** Structured JSON logs with explicit redaction. Never logs secrets, OTPs, auth headers. */

const REDACT_KEYS = /authorization|secret|passphrase|api[-_]?key|otp|password|payment|x-payment/i;

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACT_KEYS.test(k) ? "[redacted]" : v;
  }
  return out;
}

export function log(event: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), event, ...redact(fields) }) + "\n"
  );
}
