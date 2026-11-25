/**
 * In-memory store size monitor (issue #523).
 *
 * Until the remaining stores are migrated to Postgres, it is worth at minimum
 * knowing how large the in-process stores are getting in a running instance.
 * An unexpectedly large or still-growing count is itself a signal (of real
 * volume or a potential leak) worth alerting on.
 *
 * This module exposes two things:
 *
 *  1. `sampleInMemoryStoreSizes()` — reads the current size of every tracked
 *     in-process store and returns a plain object with counts.  Callers
 *     (the health endpoint, the periodic log emitter) use this to surface the
 *     numbers without touching process internals directly.
 *
 *  2. `startInMemoryStoreMonitor(intervalMs)` — starts a periodic logger that
 *     emits the counts and fires a `logger.warn` (+ Sentry event) when any
 *     store exceeds the configured threshold.  Returns the timer handle so the
 *     caller can stop it in tests or during graceful shutdown.
 *
 * Thresholds
 * ----------
 * The warn threshold defaults to half of the refund store's hard cap
 * (REFUND_STORE_MAX / 2 = 5 000) — well below the eviction ceiling, giving
 * operators time to react before the store starts dropping entries.  The same
 * threshold is applied to the changelog store whose growth is unbounded until
 * the archival plan in changelog.service.ts lands.
 */

import { logger } from "../lib/logger";
import { Sentry } from "../lib/sentry";
import { refundService } from "./refund.service";
import { changelogService } from "./changelog.service";
import { REFUND_STORE_MAX } from "./refund.service";

/** Default warn threshold: half the refund store's hard eviction ceiling. */
export const IN_MEMORY_STORE_WARN_THRESHOLD = Math.floor(REFUND_STORE_MAX / 2);

/** Default monitoring interval: every 60 seconds. */
export const IN_MEMORY_STORE_MONITOR_INTERVAL_MS = 60_000;

export interface InMemoryStoreSizes {
  refundClaims: number;
  changelogEntries: number;
}

/**
 * Reads the current size of every tracked in-process store.
 *
 * This is a pure, synchronous snapshot — it does not mutate any store state
 * and is safe to call at any time (health endpoint, periodic emitter, tests).
 */
export function sampleInMemoryStoreSizes(): InMemoryStoreSizes {
  return {
    refundClaims: refundService.storeSize,
    changelogEntries: changelogService.storeSize,
  };
}

/**
 * Starts a periodic log emitter for in-memory store sizes.
 *
 * Every `intervalMs` milliseconds it:
 *   - Logs the current counts at `info` level.
 *   - Emits a `logger.warn` + Sentry warning for any store that exceeds
 *     `threshold`.
 *
 * Returns the timer handle so the caller can call `clearInterval` on it
 * during shutdown or in tests.
 */
export function startInMemoryStoreMonitor(
  intervalMs: number = IN_MEMORY_STORE_MONITOR_INTERVAL_MS,
  threshold: number = IN_MEMORY_STORE_WARN_THRESHOLD,
): NodeJS.Timeout {
  const timer = setInterval(() => {
    const sizes = sampleInMemoryStoreSizes();

    logger.info(
      { ...sizes, alert: "in_memory_store_sizes" },
      "[IN_MEMORY_STORE_MONITOR] Current in-memory store sizes",
    );

    for (const [name, count] of Object.entries(sizes) as [keyof InMemoryStoreSizes, number][]) {
      if (count > threshold) {
        const message = `[IN_MEMORY_STORE_HIGH] ${name} store size ${count} exceeds threshold ${threshold}`;
        logger.warn(
          { store: name, count, threshold, alert: "in_memory_store_high" },
          message,
        );
        Sentry.captureMessage(message, {
          level: "warning",
          tags: { alert: "in_memory_store_high", store: name },
          extra: { count, threshold },
        });
      }
    }
  }, intervalMs);

  // Never keep the process alive solely for monitoring.
  timer.unref();
  return timer;
}
