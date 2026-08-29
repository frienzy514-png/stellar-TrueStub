/**
 * POST /api/refunds/claim
 *
 * Idempotent refund-claim endpoint (issue #153).
 *
 * Calling this endpoint twice with the same `refundId` returns 409 with
 * code REFUND_ALREADY_CLAIMED on the second call.
 *
 * Request body:
 *   {
 *     "refundId":  "string — unique idempotency key (e.g. on-chain tx hash)",
 *     "escrowId":  "string — the escrow being refunded",
 *     "amount":    "string | number — optional, for display",
 *     "currency":  "string — optional, e.g. USDC",
 *     "claimedBy": "string — optional, caller user-id"
 *   }
 *
 * GET /api/refunds/claim/:refundId
 *
 * Returns the existing claim record or 404 if not yet claimed.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { refundService } from "../services/refund.service";
import { AppError } from "../middleware/errorHandler";

export const refundsRouter = Router();

const claimSchema = z.object({
  refundId: z.string().min(1, "refundId is required"),
  escrowId: z.string().min(1, "escrowId is required"),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  claimedBy: z.string().optional(),
});

// POST /api/refunds/claim
refundsRouter.post("/claim", async (req: Request, res: Response) => {
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

  try {
    const record = await refundService.claimRefund(parsed.data);
    return res.status(201).json({ success: true, claim: record });
  } catch (err) {
    if (err instanceof AppError && err.code === "REFUND_ALREADY_CLAIMED") {
      // Fetch original claim so the caller can get an idempotent response
      const existing = await refundService.getClaimStatus(parsed.data.refundId);
      return res.status(409).json({
        error: { code: err.code, message: err.message },
        claim: existing ?? null,
      });
    }
    throw err; // re-throw; global errorHandler will catch unexpected errors
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

  const record = await refundService.getClaimStatus(refundId);
  if (!record) {
    return res.status(404).json({
      error: { code: "REFUND_NOT_FOUND", message: `No claim found for refundId: ${refundId}` },
    });
  }

  return res.json({ claim: record });
});
