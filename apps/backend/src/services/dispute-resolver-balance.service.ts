import { env } from '../config/env';
import { logger } from '../lib/logger';
import { captureLowBalanceAlert } from '../lib/sentry';
import { getAccountBalance } from '../lib/trustless-work';

/**
 * Default interval between dispute-resolver wallet balance checks (15 minutes).
 */
const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export interface DisputeResolverBalanceCheckResult {
  /** Whether the check was skipped (e.g. wallet address not configured). */
  skipped: boolean;
  /** The configured dispute-resolver wallet address, if any. */
  walletAddress?: string;
  /** The observed on-chain balance, if it could be retrieved. */
  balance?: number;
  /** The configured low-balance threshold, if any. */
  threshold?: number;
  /** Whether the balance is below the configured threshold. */
  low: boolean;
  /** Error encountered while performing the check, if any. */
  error?: unknown;
}

/**
 * Performs a single balance check for the dispute-resolver wallet.
 *
 * - Skips when DISPUTE_RESOLVER_WALLET_ADDRESS is unset.
 * - Queries the on-chain balance via the Stellar/Trustless Work integration.
 * - Compares against DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD.
 * - Triggers a low-balance alert when the balance is below the threshold.
 */
export async function checkDisputeResolverBalance(): Promise<DisputeResolverBalanceCheckResult> {
  const walletAddress = env.DISPUTE_RESOLVER_WALLET_ADDRESS;

  if (!walletAddress || walletAddress.trim() === '') {
    logger.debug(
      'Dispute-resolver balance check skipped: DISPUTE_RESOLVER_WALLET_ADDRESS is not set',
    );
    return { skipped: true, low: false };
  }

  // Validated and coerced by the schema: a non-numeric threshold now fails
  // startup instead of being silently ignored here (#526).
  const threshold = env.DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD;

  try {
    const balance = await getAccountBalance(walletAddress);

    if (threshold === undefined) {
      logger.debug(
        'Dispute-resolver balance check: no DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD configured, skipping comparison',
        { walletAddress, balance },
      );
      return {
        skipped: false,
        walletAddress,
        balance,
        low: false,
      };
    }

    const low = balance < threshold;

    if (low) {
      logger.warn('Dispute-resolver wallet balance is below threshold', {
        walletAddress,
        balance,
        threshold,
      });
      captureLowBalanceAlert({
        walletAddress,
        balance,
        threshold,
      });
    } else {
      logger.debug('Dispute-resolver wallet balance is healthy', {
        walletAddress,
        balance,
        threshold,
      });
    }

    return {
      skipped: false,
      walletAddress,
      balance,
      threshold,
      low,
    };
  } catch (error) {
    logger.error('Failed to check dispute-resolver wallet balance', {
      walletAddress,
      error,
    });
    return {
      skipped: false,
      walletAddress,
      threshold,
      low: false,
      error,
    };
  }
}

/**
 * Starts a periodic monitor that checks the dispute-resolver wallet balance.
 *
 * Returns a stop function that clears the interval.
 */
export function startDisputeResolverBalanceMonitor(
  intervalMs: number = DEFAULT_CHECK_INTERVAL_MS,
): () => void {
  const runCheck = () => {
    void checkDisputeResolverBalance().catch((error) => {
      logger.error('Unexpected error during dispute-resolver balance monitor run', {
        error,
      });
    });
  };

  // Run an initial check immediately so we don't wait a full interval.
  runCheck();

  const timer = setInterval(runCheck, intervalMs);

  // Don't keep the process alive solely for this monitor.
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  logger.info('Dispute-resolver balance monitor started', { intervalMs });

  return () => {
    clearInterval(timer);
    logger.info('Dispute-resolver balance monitor stopped');
  };
}