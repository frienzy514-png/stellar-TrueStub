/**
 * Dispute routes — issue #156
 *
 * POST /api/disputes                         → open a new dispute (OPEN state)
 * GET  /api/disputes/:disputeId              → get dispute state
 * GET  /api/disputes/escrow/:escrowId        → list disputes for an escrow
 * POST /api/disputes/:disputeId/escalate     → OPEN → ESCALATED
 * POST /api/disputes/:disputeId/resolve      → OPEN|ESCALATED → RESOLVED
 * POST /api/disputes/:disputeId/withdraw     → OPEN|ESCALATED → WITHDRAWN
 *
 * Invalid transitions return 422 DISPUTE_INVALID_TRANSITION.
 * Transitions from final states return 409 DISPUTE_ALREADY_FINAL.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { disputeService } from "../services/dispute.service";
import { AppError } from "../middleware/errorHandler";

export const disputesRouter = Router();

const openSchema = z.object({
  disputeId: z.string().min(1),
  escrowId: z.string().min(1),
  raisedBy: z.string().min(1),
  reason: z.string().min(1),
});

const resolveBodySchema = z.object({
  resolution: z.string().optional(),
});

function handleAppError(err: unknown, res: Response): Response | void {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }
  throw err;
}

// POST /api/disputes
disputesRouter.post("/", async (req: Request, res: Response) => {
  const parsed = openSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "DISPUTE_INVALID_PAYLOAD",
        message: "Invalid dispute payload",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    const dispute = await disputeService.openDispute(parsed.data);
    return res.status(201).json({ dispute });
  } catch (err) {
    return handleAppError(err, res);
  }
});

// GET /api/disputes/escrow/:escrowId — must come before /:disputeId
disputesRouter.get("/escrow/:escrowId", async (req: Request, res: Response) => {
  const disputes = await disputeService.listDisputesByEscrow(req.params.escrowId);
  return res.json({ disputes });
});

// GET /api/disputes/:disputeId
disputesRouter.get("/:disputeId", async (req: Request, res: Response) => {
  const dispute = await disputeService.getDispute(req.params.disputeId);
  if (!dispute) {
    return res.status(404).json({
      error: { code: "DISPUTE_NOT_FOUND", message: `Dispute not found: ${req.params.disputeId}` },
    });
  }
  return res.json({ dispute });
});

// POST /api/disputes/:disputeId/escalate
disputesRouter.post("/:disputeId/escalate", async (req: Request, res: Response) => {
  try {
    const dispute = await disputeService.transition(req.params.disputeId, "escalate");
    return res.json({ dispute });
  } catch (err) {
    return handleAppError(err, res);
  }
});

// POST /api/disputes/:disputeId/resolve
disputesRouter.post("/:disputeId/resolve", async (req: Request, res: Response) => {
  const { resolution } = resolveBodySchema.parse(req.body || {});

  try {
    const dispute = await disputeService.transition(req.params.disputeId, "resolve", { resolution });
    return res.json({ dispute });
  } catch (err) {
    return handleAppError(err, res);
  }
});

// POST /api/disputes/:disputeId/withdraw
disputesRouter.post("/:disputeId/withdraw", async (req: Request, res: Response) => {
  try {
    const dispute = await disputeService.transition(req.params.disputeId, "withdraw");
    return res.json({ dispute });
  } catch (err) {
    return handleAppError(err, res);
  }
});
