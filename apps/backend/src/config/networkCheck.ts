/**
 * Frontend / backend network mismatch check (#414).
 *
 * Refuses to start when the frontend and backend are configured for different
 * Stellar networks (e.g. frontend on testnet, backend on mainnet). Called once
 * from `index.ts` before `startServer()` so the mismatch is caught at process
 * start rather than discovered in production.
 *
 * The check is a no-op when `FRONTEND_TRUSTLESS_NETWORK` is not set — that
 * covers local dev where the frontend isn't running and staging environments
 * where only the backend is deployed independently.
 */

import { env } from "./env";
import { logger } from "../lib/logger";

/**
 * Asserts that the frontend's configured network
 * (`FRONTEND_TRUSTLESS_NETWORK`) matches the backend's
 * (`STELLAR_NETWORK`). Exits the process with code 1 on mismatch so the
 * orchestrator restarts or rolls back instead of serving mismatched traffic.
 *
 * Safe to call in test environments — when `FRONTEND_TRUSTLESS_NETWORK` is
 * not set the check is skipped entirely.
 */
export function assertNetworkConfigMatches(): void {
  const backendNetwork = env.STELLAR_NETWORK;
  const frontendNetwork = env.FRONTEND_TRUSTLESS_NETWORK;

  // Not configured — skip the check (local dev, backend-only staging).
  if (!frontendNetwork) {
    return;
  }

  if (frontendNetwork !== backendNetwork) {
    logger.fatal(
      {
        backendNetwork,
        frontendNetwork,
      },
      `[STARTUP] Network mismatch: frontend is configured for "${frontendNetwork}" ` +
        `but backend is configured for "${backendNetwork}". ` +
        "Set STELLAR_NETWORK and FRONTEND_TRUSTLESS_NETWORK to the same value.",
    );
    process.exit(1);
  }

  logger.info(
    { network: backendNetwork },
    `[STARTUP] Frontend/backend network check passed: both on "${backendNetwork}"`,
  );
}
