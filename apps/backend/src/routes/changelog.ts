/**
 * Changelog routes — issue #155
 *
 * POST   /api/changelog           → append a write-once entry
 * GET    /api/changelog/:entryId  → get a single entry
 * GET    /api/changelog/resource/:resourceId  → list entries for a resource
 * DELETE /api/changelog/:entryId  → remove an entry (log-level delete + event)
 * PUT    /api/changelog/:entryId  → always 409 — update is forbidden
 * PATCH  /api/changelog/:entryId  → always 409 — update is forbidden
 *
 * API contract (write-once)
 * -------------------------
 * Entries are immutable after creation.  Any PUT/PATCH attempt returns 409
 * with code CHANGELOG_UPDATE_FORBIDDEN.  To correct a wrong entry:
 *   1. DELETE /api/changelog/:entryId
 *   2. POST   /api/changelog  (with the corrected data)
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { changelogService } from "../services/changelog.service";
import { AppError } from "../middleware/errorHandler";

export const changelogRouter = Router();

const appendSchema = z.object({
  entryId: z.string().min(1, "entryId is required"),
  action: z.string().min(1, "action is required"),
  actorId: z.string().min(1, "actorId is required"),
  resourceId: z.string().min(1, "resourceId is required"),
  metadata: z.record(z.unknown()).optional(),
});

// POST /api/changelog — append a new immutable entry
changelogRouter.post("/", async (req: Request, res: Response) => {
  const parsed = appendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "CHANGELOG_INVALID_PAYLOAD",
        message: "Invalid changelog entry payload",
        details: parsed.error.flatten(),
      },
    });
  }

  try {
    const entry = await changelogService.appendEntry(parsed.data);
    return res.status(201).json({ entry });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    }
    throw err;
  }
});

// GET /api/changelog/resource/:resourceId — list entries for a resource
// NOTE: This route must be declared BEFORE /:entryId to avoid route shadowing
changelogRouter.get("/resource/:resourceId", async (req: Request, res: Response) => {
  const entries = await changelogService.listEntries(req.params.resourceId);
  return res.json({ entries });
});

// GET /api/changelog/:entryId
changelogRouter.get("/:entryId", async (req: Request, res: Response) => {
  const entry = await changelogService.getEntry(req.params.entryId);
  if (!entry) {
    return res.status(404).json({
      error: { code: "CHANGELOG_ENTRY_NOT_FOUND", message: `Entry not found: ${req.params.entryId}` },
    });
  }
  return res.json({ entry });
});

// DELETE /api/changelog/:entryId — remove (with audit event)
changelogRouter.delete("/:entryId", async (req: Request, res: Response) => {
  try {
    const entry = await changelogService.removeEntry(req.params.entryId);
    return res.json({ removed: true, entry });
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    }
    throw err;
  }
});

// PUT /api/changelog/:entryId — FORBIDDEN (write-once)
changelogRouter.put("/:entryId", async (_req: Request, res: Response) => {
  return res.status(409).json({
    error: {
      code: "CHANGELOG_UPDATE_FORBIDDEN",
      message:
        "Changelog entries are write-once and cannot be updated. To correct an entry: DELETE it then POST a new one.",
    },
  });
});

// PATCH /api/changelog/:entryId — FORBIDDEN (write-once)
changelogRouter.patch("/:entryId", async (_req: Request, res: Response) => {
  return res.status(409).json({
    error: {
      code: "CHANGELOG_UPDATE_FORBIDDEN",
      message:
        "Changelog entries are write-once and cannot be updated. To correct an entry: DELETE it then POST a new one.",
    },
  });
});
