/**
 * Retry utility for transient Stellar/network failures.
 *
 * Transient errors (worth retrying): network timeouts, sequence number races,
 * 503 / 504 / 429 HTTP responses, EAGAIN.
 *
 * Definitive errors (never retry): insufficient balance/funds, rejected
 * signature, invalid signature, 400 / 401 / 403 HTTP responses.
 */

/** Shape that HTTP-error objects may carry (e.g. Axios, Fetch wrappers). */
interface HttpErrorLike {
  response?: {
    status?: number;
  };
  status?: number;
  message?: string;
}

/**
 * Determines whether an error is transient and therefore worth retrying.
 *
 * @param error - The caught error (type unknown).
 * @returns `true` if the error is transient; `false` if it is definitive.
 */
export function isTransientError(error: unknown): boolean {
  if (error == null) return false;

  const err = error as HttpErrorLike;

  // ── HTTP status codes ───────────────────────────────────────────────────────
  const status = err.response?.status ?? err.status;
  if (typeof status === "number") {
    // Definitive client-error codes — do not retry.
    if (status === 400 || status === 401 || status === 403) return false;
    // Transient server-error / rate-limit codes.
    if (status === 429 || status === 503 || status === 504) return true;
  }

  // ── Message heuristics ──────────────────────────────────────────────────────
  const message =
    typeof err.message === "string" ? err.message.toLowerCase() : "";

  // Definitive: insufficient funds / balance, rejected transaction, bad signature.
  const definitivePatterns = [
    "insufficient",
    "balance",
    "rejected",
    "invalid signature",
    "bad auth",
    "unauthorized",
  ];
  if (definitivePatterns.some((p) => message.includes(p))) return false;

  // Transient: timeouts, network connectivity, Stellar sequence races, EAGAIN.
  const transientPatterns = [
    "timeout",
    "timed out",
    "network error",
    "network request failed",
    "econnreset",
    "econnrefused",
    "fetch failed",
    "503",
    "504",
    "429",
    "sequence",
    "eagain",
    "try again",
    "rate limit",
    "service unavailable",
  ];
  if (transientPatterns.some((p) => message.includes(p))) return true;

  // Unknown errors: treat as transient so we at least attempt a retry once.
  return true;
}

/** Delay helper — resolves after `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential back-off.
 *
 * Strategy:
 * - Up to `maxAttempts` total attempts (attempt 0 = first try, no wait).
 * - Delay before each retry = `baseDelayMs * 2^(retryIndex)`:
 *   retry 1 → 1 000 ms, retry 2 → 2 000 ms (with default values).
 * - If the error is *not* transient, it is re-thrown immediately without
 *   consuming additional attempts.
 *
 * @param fn           - Async function to execute.
 * @param options.maxAttempts  - Total attempts including the first (default 3).
 * @param options.baseDelayMs  - Base back-off delay in ms (default 1 000).
 * @param options.onRetry      - Called before each retry with (attemptNumber, error).
 *                               `attemptNumber` is 1-based (first retry = 1).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const onRetry = options?.onRetry;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Never retry on definitive failures.
      if (!isTransientError(error)) {
        throw error;
      }

      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt) {
        // Exhausted all retries — surface the error.
        break;
      }

      // Calculate exponential back-off delay: baseDelayMs * 2^attempt
      // attempt=0 → 1 000 ms, attempt=1 → 2 000 ms, attempt=2 → 4 000 ms …
      const delayMs = baseDelayMs * Math.pow(2, attempt);

      // Notify caller about the upcoming retry (1-based retry count).
      onRetry?.(attempt + 1, error);

      await sleep(delayMs);
    }
  }

  throw lastError;
}
