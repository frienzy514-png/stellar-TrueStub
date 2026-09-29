/**
 * POST /api/refunds/claim
 *
 * Idempotent refund-claim endpoint (issue #153) that executes the refund
 * on-chain via Trustless Work (issue #252).
 *
 * Calling this endpoint twice with the same `refundId` returns 409 with
 * code REFUND_ALREADY_CLAIMED on the second call — unless the first on-chain
 * attempt failed, in which case the refund is retried.
 *
 * Retries are bounded (issue #329): a refund that keeps failing on-chain is
 * only auto-retried up to MAX_REFUND_RETRIES times. Once the budget is spent
 * the endpoint stops attempting the on-chain call and returns 409 with code
 * REFUND_NEEDS_MANUAL_INTERVENTION, a terminal state requiring an operator.
 *
 * Request body:
 *   {
 *     "refundId":       "string — unique idempotency key",
 *     "escrowId":       "string — Trustless Work escrow contract id (C...)",
 *     "refundTo":       "string — buyer's Stellar address receiving the refund",
 *     "amount":         "string | number — full disputed escrow balance",
 *     "escrowType":     "single-release | multi-release — default single-release",
 *     "milestoneIndex": "string — required for multi-release",
 *     "currency":       "string — optional, e.g. USDC"
 *   }
 *
 * The caller identity (`claimedBy`) is derived from the verified session
 * (issue #303) — it is never read from the request body.
 *
 * Responses: 201 with `claim.status = "submitted"` and `claim.txHash`;
 * 400 REFUND_AMOUNT_MISMATCH when `amount` doesn't equal the disputed balance;
 * 409 REFUND_ALREADY_CLAIMED for a second identical call against the same
 * escrow; 409 REFUND_ID_REUSED_ACROSS_ESCROWS when the same `refundId` is
 * reused against a different escrow;
 * 502 REFUND_EXECUTION_FAILED if the chain rejected it;
 * 503 REFUND_EXECUTION_UNAVAILABLE if Trustless Work isn't configured;
 * 409 REFUND_NEEDS_MANUAL_INTERVENTION once the retry budget is exhausted.
 *
 * GET /api/refunds/claim/:refundId
 *
 * Returns the existing claim record or 404 if not yet claimed.
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as Sentry from "@sentry/node";
import { refundService } from "../services/refund.service";
import { changelogService } from "../services/changelog.service";
import { AppError } from "../middleware/errorHandler";
import { alertService } from "../services/alert.service";

export const refundsRouter = Router();

/**
 * Maximum number of on-chain attempts (initial + retries) for a single
 * refundId before the refund is parked in a terminal state (issue #329).
 */
export const MAX_REFUND_ATTEMPTS = 5;

const claimSchema = z.object({
  refundId: z.string().min(1, "refundId is required"),
  escrowId: z.string().min(1, "escrowId is required"),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  refundTo: z.string().regex(/^[GC][A-Z2-7]{55}$/, "refundTo must be a Stellar address"),
  escrowType: z.enum(["single-release", "multi-release"]).optional(),
  milestoneIndex: z.string().optional(),
});

/**
 * Derive the caller's verified identity from the authenticated session.
 *
 * The session is populated by the auth middleware (e.g. `req.user` /
 * `req.auth`). We deliberately do NOT fall back to any client-supplied
 * value — an unauthenticated request must not be able to assert who it is
 * for an authorization-relevant field (issue #303).
 */
function getVerifiedUserId(req: Request): string | undefined {
  const auth = (req as Request & {
    user?: { id?: string; uid?: string };
    auth?: { userId?: string; uid?: string };
  });
  return auth.user?.id ?? auth.user?.uid ?? auth.auth?.userId ?? auth.auth?.uid;
}

// POST /api/refunds/claim
refundsRouter.post("/claim", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "REFUND_INVALID_PAYLOAD",
        message: "Invalid refund claim payload",
        details: parsed.error.flatten(),
      },
    });
  }

  const claimedBy = getVerifiedUserId(req);
  if (!claimedBy) {
    return res.status(401).json({
      error: {
        code: "REFUND_UNAUTHENTICATED",
        message: "Authentication required to claim a refund",
      },
    });
  }

  try {
    const record = await refundService.claimRefund({ ...parsed.data, claimedBy });
    return res.status(201).json({ success: true, claim: record });
  } catch (err) {
    if (err instanceof AppError && err.code === "REFUND_ALREADY_CLAIMED") {
      // Fetch original claim so the caller can get an idempotent response
      const existing = await refundService.getClaimStatus(refundId);
      return res.status(409).json({
        error: { code: err.code, message: err.message },
        claim: existing ?? null,
      });
    }

    // Record the specific failure step so the Sentry event pinpoints where the
    // refund flow broke (validation already passed at this point).
    Sentry.setContext("refund_failure", {
      step: "claimRefund",
      code: err instanceof AppError ? err.code : "UNKNOWN",
      message: err instanceof Error ? err.message : String(err),
    });
    Sentry.captureException(err);

    // Express 4 doesn't catch async throws — hand off to the global errorHandler
    // (maps REFUND_EXECUTION_FAILED → 502, REFUND_EXECUTION_UNAVAILABLE → 503).
    return next(err);
  }
});

// GET /api/refunds/claim/:refundId
refundsRouter.get("/claim/:refundId", async (req: Request, res: Response) => {
  const { refundId } = req.params;
  if (!refundId) {
    return res.status(400).json({
      error: { code: "REFUND_INVALID_PAYLOAD", message: "refundId param is required" },
    });
  }

  Sentry.setTag("route", "refunds.claim.status");
  Sentry.setTag("refundId", refundId);
  Sentry.setContext("refund", { refundId });

  const record = await refundService.getClaimStatus(refundId);
  if (!record) {
    return res.status(404).json({
      error: { code: "REFUND_NOT_FOUND", message: `No claim found for refundId: ${refundId}` },
    });
  }

  return res.json({ claim: record });
});

// ---------------------------------------------------------------------------
// End-to-end dispute-to-refund flow test (issue #340)
//
// Walks the full real-money-movement chain — raise dispute → escalate →
// resolve → claim refund — across disputes.ts, dispute.service.ts, refunds.ts
// and the changelog audit log, then asserts the final state (escrow status,
// refund transaction, changelog entries). It fails if any step regresses.
//
// Exported so the integration suite can drive it directly; also mounted as
// GET /api/refunds/_e2e/dispute-to-refund so it can be exercised over HTTP.
// ---------------------------------------------------------------------------

export interface DisputeToRefundE2EDeps {
  raiseDispute: (input: {
    escrowId: string;
    raisedBy: string;
    reason: string;
  }) => Promise<{ disputeId: string; status: string }>;
  escalateDispute: (input: {
    disputeId: string;
    escalatedBy: string;
  }) => Promise<{ disputeId: string; status: string }>;
  resolveDispute: (input: {
    disputeId: string;
    resolvedBy: string;
    outcome: "refund" | "release";
  }) => Promise<{ disputeId: string; status: string; escrowStatus: string }>;
  claimRefund: (input: {
    refundId: string;
    escrowId: string;
    refundTo: string;
    amount: string | number;
    claimedBy?: string;
  }) => Promise<{ refundId: string; status: string; txHash?: string }>;
  getEscrowStatus: (escrowId: string) => Promise<string>;
  getChangelog: (escrowId: string) => Promise<Array<{ action: string; actor?: string }>>;
}

export interface DisputeToRefundE2EResult {
  disputeId: string;
  refundId: string;
  escrowStatus: string;
  refund: { refundId: string; status: string; txHash?: string };
  changelog: Array<{ action: string; actor?: string }>;
}

/**
 * Runs the complete dispute-to-refund chain and asserts the final state.
 * Throws if any step in the chain regresses.
 */
export async function runDisputeToRefundE2E(
  deps: DisputeToRefundE2EDeps,
  input: {
    escrowId: string;
    buyer: string;
    seller: string;
    amount: string | number;
    reason?: string;
  },
): Promise<DisputeToRefundE2EResult> {
  const { escrowId, buyer, seller, amount } = input;
  const reason = input.reason ?? "Item not as described";

  // 1. Raise the dispute.
  const raised = await deps.raiseDispute({ escrowId, raisedBy: buyer, reason });
  if (!raised.disputeId) throw new Error("E2E: dispute was not created");
  if (raised.status !== "open") {
    throw new Error(`E2E: expected dispute status "open", got "${raised.status}"`);
  }

  // 2. Escalate the dispute.
  const escalated = await deps.escalateDispute({
    disputeId: raised.disputeId,
    escalatedBy: buyer,
  });
  if (escalated.status !== "escalated") {
    throw new Error(`E2E: expected dispute status "escalated", got "${escalated.status}"`);
  }

  // 3. Resolve the dispute in the buyer's favour (refund outcome).
  const resolved = await deps.resolveDispute({
    disputeId: raised.disputeId,
    resolvedBy: seller,
    outcome: "refund",
  });
  if (resolved.status !== "resolved") {
    throw new Error(`E2E: expected dispute status "resolved", got "${resolved.status}"`);
  }

  // 4. Claim the refund against the disputed escrow.
  const refundId = `refund-${raised.disputeId}`;
  const refund = await deps.claimRefund({
    refundId,
    escrowId,
    refundTo: buyer,
    amount,
    claimedBy: buyer,
  });
  if (refund.status !== "submitted") {
    throw new Error(`E2E: expected refund status "submitted", got "${refund.status}"`);
  }
  if (!refund.txHash) {
    throw new Error("E2E: refund was submitted without a transaction hash");
  }

  // 5. Assert the final escrow status reflects the refund.
  const escrowStatus = await deps.getEscrowStatus(escrowId);
  if (escrowStatus !== "refunded") {
    throw new Error(`E2E: expected escrow status "refunded", got "${escrowStatus}"`);
  }

  // 6. Assert the changelog audit log recorded every step of the chain.
  const changelog = await deps.getChangelog(escrowId);
  const actions = changelog.map((entry) => entry.action);
  for (const expected of [
    "dispute.raised",
    "dispute.escalated",
    "dispute.resolved",
    "refund.claimed",
  ]) {
    if (!actions.includes(expected)) {
      throw new Error(`E2E: changelog is missing "${expected}" entry`);
    }
  }

  return {
    disputeId: raised.disputeId,
    refundId,
    escrowStatus,
    refund,
    changelog,
  };
}

// GET /api/refunds/_e2e/dispute-to-refund
//
// HTTP entry point for the dispute-to-refund E2E flow. The integration suite
// injects the real dispute/refund services via `req.app.locals.e2eDeps`.
refundsRouter.get(
  "/_e2e/dispute-to-refund",
  async (req: Request, res: Response, next: NextFunction) => {
    const deps = (req.app.locals as { e2eDeps?: DisputeToRefundE2EDeps }).e2eDeps;
    if (!deps) {
      return res.status(503).json({
        error: {
          code: "E2E_DEPS_UNAVAILABLE",
          message: "E2E dependencies are not configured on app.locals.e2eDeps",
        },
      });
    }

    const { escrowId, buyer, seller, amount } = req.query as Record<string, string>;
    if (!escrowId || !buyer || !seller || !amount) {
      return res.status(400).json({
        error: {
          code: "REFUND_INVALID_PAYLOAD",
          message: "escrowId, buyer, seller and amount query params are required",
        },
      });
    }

    try {
      const result = await runDisputeToRefundE2E(deps, {
        escrowId,
        buyer,
        seller,
        amount,
      });
      return res.json({ success: true, result });
    } catch (err) {
      return next(err);
    }
  },
);
