/**
 * Ownership Transfer routes — issue #154
 *
 * POST /api/transfers/initiate
 *   Body: { transferId, escrowId, fromOwner, toOwner }
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
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { ownershipTransferService } from "../services/ownership-transfer.service";
import { AppError } from "../middleware/errorHandler";

export const transfersRouter = Router();

const initiateSchema = z.object({
  transferId: z.string().min(1, "transferId is required"),
  escrowId: z.string().min(1, "escrowId is required"),
  fromOwner: z.string().min(1, "fromOwner is required"),
  toOwner: z.string().min(1, "toOwner is required"),
});

// POST /api/transfers/initiate
transfersRouter.post("/initiate", async (req: Request, res: Response) => {
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

  try {
    const transfer = await ownershipTransferService.initiateTransfer(parsed.data);
    return res.status(201).json({ transfer });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    }
    throw err;
  }
});

// POST /api/transfers/:transferId/accept
transfersRouter.post("/:transferId/accept", async (req: Request, res: Response) => {
  try {
    const transfer = await ownershipTransferService.acceptTransfer(req.params.transferId);
    return res.json({ transfer });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    }
    throw err;
  }
});

// POST /api/transfers/:transferId/cancel
transfersRouter.post("/:transferId/cancel", async (req: Request, res: Response) => {
  try {
    const transfer = await ownershipTransferService.cancelTransfer(req.params.transferId);
    return res.json({ transfer });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    }
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
