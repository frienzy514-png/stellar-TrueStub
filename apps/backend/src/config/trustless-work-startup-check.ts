import { env } from "./env";
import { logger } from "../lib/logger";

/**
 * Logs a clear warning at boot when the Trustless Work refund / dispute
 * credentials are unset (#569). Those routes intentionally return 503
 * REFUND_EXECUTION_UNAVAILABLE in that state; surfacing it at startup makes the
 * degraded mode visible to operators instead of only appearing on first request.
 */
export function warnIfTrustlessWorkUnconfigured(): void {
  const missing: string[] = [];
  if (!env.TRUSTLESS_WORK_API_KEY) missing.push("TRUSTLESS_WORK_API_KEY");
  if (!env.TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET) missing.push("TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET");

  if (missing.length > 0) {
    logger.warn(
      { missing },
      "Refund execution and dispute resolution will return 503 until these variables are set",
    );
  }
}
