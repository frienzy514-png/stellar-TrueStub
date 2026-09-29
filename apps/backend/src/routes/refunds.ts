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
