import { buildApp } from "./app.js";
import { loadPaymentEnv } from "./config/payment.js";
import { log } from "./lib/logger.js";

// In production this throws when payment credentials are missing — no fake fallback.
if (process.env.NODE_ENV === "production") loadPaymentEnv();

const port = Number(process.env.PORT ?? 4000);
const { app, initialize } = buildApp();

app.listen(port, async () => {
  await initialize();
  log("server_started", { port, node_env: process.env.NODE_ENV ?? "development" });
});
