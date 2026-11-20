/**
 * Ownership Transfer routes — issue #154
 *
 * POST /api/transfers/initiate
 *   Body: { transferId, escrowId, toOwner }
 *   → 201 { transfer }
 *
 * POST /api/transfers/:transferId/accept
 *   → 200 { transfer }
 *
 * POST /api/transfers/:transferId/cancel
 *   → 200 { transfer }
 *
 * GET  /api/transfers/:transferId
 *   → 200 { transfer } | 404
 *
 * Atomicity / partial-failure handling (issue #318):
 *   The multi-step transfer logic lives in ownership-transfer.service.ts.
 *   Each mutating step is applied through the service's transactional
 *   boundary; if a later step fails, the service compensates the earlier
 *   steps so the transfer is never left half-applied. The routes below
 *   surface that guarantee by mapping a failed (rolled-back) transfer to a
 *   deterministic error response instead of a partially-applied success.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import * as Sentry from "@sentry/node";
import { ownershipTransferService } from "../services/ownership-transfer.service";
import { changelogService } from "../services/changelog.service";
import { AppError } from "../middleware/errorHandler";
import { trackFinancialOperation } from "../lib/financial-operation-monitor";
import { sendCriticalAlert } from "../services/critical-alert.service";
import { getRequestId } from "../middleware/requestLogger";

export const transfersRouter = Router();

const initiateSchema = z.object({
  transferId: z.string().min(1, "transferId is required"),
  escrowId: z.string().min(1, "escrowId is required"),
  toOwner: z.string().min(1, "toOwner is required"),
});

/**
 * Derive the caller's verified identity from the Firebase token decoded by
 * `requireAuth` (mounted in index.ts) into `res.locals.user`.
 * Never trust a client-supplied `fromOwner`/`userId` for authorization (#380).
 */
function getVerifiedUserId(res: Response): string | null {
  return (res.locals.user as { uid?: string } | undefined)?.uid ?? null;
}

// POST /api/transfers/initiate
transfersRouter.post("/initiate", async (req: Request, res: Response) => {
  const fromOwner = getVerifiedUserId(res);
  if (!fromOwner) {
    return res.status(401).json({
      error: { code: "TRANSFER_UNAUTHENTICATED", message: "Authentication required" },
    });
  }

  const parsed = initiateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "TRANSFER_INVALID_PAYLOAD",
        message: "Invalid initiate transfer payload",
        details: parsed.error.flatten(),
      },
    });
  }

  const requestId = getRequestId(req);

  try {
    const transfer = await trackFinancialOperation(
      "transfer.initiate",
      () => ownershipTransferService.initiateTransfer({ ...parsed.data, fromOwner, requestId }),
      { transferId: parsed.data.transferId, escrowId: parsed.data.escrowId, requestId },
    );
    return res.status(201).json({ transfer });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    }
    Sentry.setTag("route", "transfers.initiate");
    Sentry.setTag("transferId", parsed.data.transferId);
    Sentry.setTag("escrowId", parsed.data.escrowId);
    Sentry.setTag("requestId", requestId);
    Sentry.setContext("transfer", {
      transferId: parsed.data.transferId,
      escrowId: parsed.data.escrowId,
      fromOwner,
      toOwner: parsed.data.toOwner,
      requestId,
      failureStep: "initiateTransfer",
    });
    throw err;
  }
});

// POST /api/transfers/:transferId/accept
transfersRouter.post("/:transferId/accept", async (req: Request, res: Response) => {
  const actorId = getVerifiedUserId(res);
  if (!actorId) {
    return res.status(401).json({
      error: { code: "TRANSFER_UNAUTHENTICATED", message: "Authentication required" },
    });
  }

  const requestId = getRequestId(req);

  try {
    const transfer = await trackFinancialOperation(
      "transfer.accept",
      () => ownershipTransferService.acceptTransfer(req.params.transferId, actorId, requestId),
      { transferId: req.params.transferId, requestId },
    );
    return res.json({ transfer });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    }
    Sentry.setTag("route", "transfers.accept");
    Sentry.setTag("transferId", req.params.transferId);
    Sentry.setTag("requestId", requestId);
    Sentry.setContext("transfer", {
      transferId: req.params.transferId,
      requestId,
      failureStep: "acceptTransfer",
    });
    throw err;
  }
});

// POST /api/transfers/:transferId/cancel
transfersRouter.post("/:transferId/cancel", async (req: Request, res: Response) => {
  const actorId = getVerifiedUserId(res);
  if (!actorId) {
    return res.status(401).json({
      error: { code: "TRANSFER_UNAUTHENTICATED", message: "Authentication required" },
    });
  }

  const requestId = getRequestId(req);

  try {
    const transfer = await trackFinancialOperation(
      "transfer.cancel",
      () => ownershipTransferService.cancelTransfer(req.params.transferId, actorId, requestId),
      { transferId: req.params.transferId, requestId },
    );
    return res.json({ transfer });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    }
    Sentry.setTag("route", "transfers.cancel");
    Sentry.setTag("transferId", req.params.transferId);
    Sentry.setTag("requestId", requestId);
    Sentry.setContext("transfer", {
      transferId: req.params.transferId,
      requestId,
      failureStep: "cancelTransfer",
    });
    throw err;
  }
});

// GET /api/transfers/:transferId
transfersRouter.get("/:transferId", async (req: Request, res: Response) => {
  const transfer = await ownershipTransferService.getTransfer(req.params.transferId);
  if (!transfer) {
    return res.status(404).json({
      error: { code: "TRANSFER_NOT_FOUND", message: `Transfer not found: ${req.params.transferId}` },
    });
  }
  return res.json({ transfer });
});
