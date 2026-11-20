/**
 * Dispute routes — issue #156
 *
 * POST /api/disputes                         → open a new dispute (OPEN state)
 * GET  /api/disputes/:disputeId              → get dispute state
 * GET  /api/disputes/escrow/:escrowId        → list disputes for an escrow
 * GET  /api/disputes/mine?limit=&offset=     → paginated dispute history for the caller (#417)
 * GET  /api/disputes/sla/breaches            → list ESCALATED disputes past SLA
 * GET  /api/disputes/metrics                 → aggregate metrics for analytics (#273)
 * POST /api/disputes/:disputeId/escalate     → OPEN → ESCALATED
 * POST /api/disputes/:disputeId/resolve      → OPEN|ESCALATED → RESOLVED
 * POST /api/disputes/:disputeId/withdraw     → OPEN|ESCALATED → WITHDRAWN
 *
 * Invalid transitions return 422 DISPUTE_INVALID_TRANSITION.
 * Transitions from final states return 409 DISPUTE_ALREADY_FINAL.
 *
 * Every state transition is recorded in the write-once changelog audit log
 * by DisputeService.transition (issue #314).
 *
 * Escalated-dispute SLA (issue #317):
 * A dispute that sits in ESCALATED for longer than ESCALATED_SLA_MS (30 days)
 * is considered SLA-breached. The documented policy is manual intervention:
 * the dispute is surfaced via GET /api/disputes/sla/breaches and an alert is
 * emitted to the changelog audit log so operators can reassign it to a
 * different resolver. The state machine itself is unchanged — a breached
 * dispute remains ESCALATED and can still be resolved or withdrawn by either
 * party, so escrow funds are never permanently stuck.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import * as Sentry from "@sentry/node";
import { disputeService } from "../services/dispute.service";
import { changelogService } from "../services/changelog.service";
import { CHANGELOG_ENTRY_TYPES } from "../services/changelog-taxonomy";
import { AppError } from "../middleware/errorHandler";
import { trackFinancialOperation } from "../lib/financial-operation-monitor";
import { getRequestId } from "../middleware/requestLogger";
import { requireAuth } from "../middleware/auth";

export const disputesRouter = Router();

// Auth is enforced in the route file itself (matching the users.ts pattern)
// rather than being applied as mount-time middleware in index.ts (issue #369).
disputesRouter.use(requireAuth);

/**
 * SLA threshold for disputes sitting in ESCALATED (issue #317).
 * After this window the dispute is flagged for manual intervention.
 */
export const ESCALATED_SLA_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const openSchema = z.object({
  disputeId: z.string().min(1),
  escrowId: z.string().min(1),
  raisedBy: z.string().min(1),
  reason: z.string().min(1),
});

const metricsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(MAX_DISPUTE_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const resolveBodySchema = z.object({
  resolution: z.string().optional(),
});

/**
 * Attach the request correlation ID to the current Sentry scope so every
 * Sentry event emitted while handling this dispute request (including events
 * raised deeper in the refund → dispute → changelog chain) carries the same
 * correlation ID as the structured log lines.
 */
function tagSentryWithRequestId(req: Request): string | undefined {
  const requestId = getRequestId(req);
  if (requestId) {
    Sentry.getCurrentScope().setTag("request_id", requestId);
    Sentry.getCurrentScope().setContext("correlation", { requestId });
  }
  return requestId;
}

function handleAppError(err: unknown, res: Response): Response | void {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }
  throw err;
}

/**
 * Determine whether an ESCALATED dispute has breached the SLA window.
 * Returns the elapsed time in ms when breached, otherwise null.
 */
function escalatedSlaBreach(
  dispute: { state: string; escalatedAt?: string | Date | null },
  now: number = Date.now(),
): { elapsedMs: number } | null {
  if (dispute.state !== "ESCALATED" || !dispute.escalatedAt) return null;
  const escalatedAt = new Date(dispute.escalatedAt).getTime();
  if (Number.isNaN(escalatedAt)) return null;
  const elapsedMs = now - escalatedAt;
  return elapsedMs > ESCALATED_SLA_MS ? { elapsedMs } : null;
}

/**
 * Emit an SLA-breach alert to the changelog audit log. Best-effort: a failed
 * alert must never break the read path that surfaced the breach.
 */
async function recordSlaBreachAlert(
  dispute: { disputeId: string; escrowId: string; escalatedAt?: string | Date | null },
  elapsedMs: number,
  requestId?: string,
): Promise<void> {
  try {
    // One alert per breach: the deterministic entryId makes repeated reads of
    // /sla/breaches collide with the existing write-once entry (swallowed below).
    await changelogService.appendEntry({
      entryId: `${CHANGELOG_ENTRY_TYPES.DISPUTE_SLA_BREACH}:${dispute.disputeId}`,
      action: CHANGELOG_ENTRY_TYPES.DISPUTE_SLA_BREACH,
      actorId: "system",
      resourceId: dispute.disputeId,
      metadata: {
        escrowId: dispute.escrowId,
        state: "ESCALATED",
        escalatedAt: dispute.escalatedAt ?? null,
        elapsedMs,
        slaMs: ESCALATED_SLA_MS,
        policy: "manual_intervention",
        requestId: requestId ?? null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `Failed to write SLA breach alert for dispute ${dispute.disputeId} (requestId=${requestId ?? "unknown"})`,
      err,
    );
  }
}

// POST /api/disputes
disputesRouter.post("/", async (req: Request, res: Response) => {
  const requestId = tagSentryWithRequestId(req);
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
    const dispute = await trackFinancialOperation(
      "dispute.open",
      () => disputeService.openDispute(parsed.data, { requestId }),
      { disputeId: parsed.data.disputeId, escrowId: parsed.data.escrowId, requestId: requestId ?? "" },
    );
    return res.status(201).json({ dispute });
  } catch (err) {
    return handleAppError(err, res);
  }
});

// GET /api/disputes/escrow/:escrowId — must come before /:disputeId
disputesRouter.get("/escrow/:escrowId", async (req: Request, res: Response) => {
  const requestId = tagSentryWithRequestId(req);
  const disputes = await disputeService.listDisputesByEscrow(req.params.escrowId, { requestId });
  return res.json({ disputes });
});

// GET /api/disputes/mine — must come before /:disputeId (#417)
// Paginated dispute history for the authenticated caller. Identity comes from
// the verified session (res.locals.user), never from the query string.
disputesRouter.get("/mine", async (req: Request, res: Response) => {
  const user = res.locals.user as { uid?: string } | undefined;
  if (!user?.uid) {
    return res.status(401).json({
      error: { code: "DISPUTE_UNAUTHENTICATED", message: "Authentication required" },
    });
  }

  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "DISPUTE_INVALID_PAGINATION",
        message: `limit must be between 1 and ${MAX_DISPUTE_PAGE_SIZE}, offset must be >= 0`,
        details: parsed.error.flatten(),
      },
    });
  }

  const page = await disputeService.listDisputesByUserPaginated(user.uid, parsed.data);
  return res.json({
    disputes: page.disputes,
    pagination: {
      limit: page.limit,
      offset: page.offset,
      total: page.total,
      hasMore: page.hasMore,
    },
  });
});

// GET /api/disputes/sla/breaches — must come before /:disputeId
disputesRouter.get("/sla/breaches", async (req: Request, res: Response) => {
  const requestId = tagSentryWithRequestId(req);
  const escalated = await disputeService.listDisputesByState("ESCALATED", { requestId });
  const now = Date.now();
  const breaches = escalated
    .map((dispute) => {
      const breach = escalatedSlaBreach(dispute, now);
      return breach ? { dispute, elapsedMs: breach.elapsedMs } : null;
    })
    .filter((entry): entry is { dispute: (typeof escalated)[number]; elapsedMs: number } => entry !== null);

  // Alert on each breach so operators can reassign to a different resolver.
  await Promise.all(
    breaches.map((entry) => recordSlaBreachAlert(entry.dispute, entry.elapsedMs, requestId)),
  );

  return res.json({
    slaMs: ESCALATED_SLA_MS,
    policy: "manual_intervention",
    count: breaches.length,
    breaches: breaches.map((entry) => ({
      dispute: entry.dispute,
      elapsedMs: entry.elapsedMs,
    })),
  });
});

// GET /api/disputes/metrics?from=&to= — must come before /:disputeId (#273)
disputesRouter.get("/metrics", async (req: Request, res: Response) => {
  const requestId = tagSentryWithRequestId(req);
  const parsed = metricsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "DISPUTE_INVALID_PAYLOAD",
        message: "from/to must be valid dates",
        details: parsed.error.flatten(),
      },
    });
  }

  const metrics = await disputeService.getMetrics(parsed.data, { requestId });
  return res.json({ metrics });
});

// GET /api/disputes/:disputeId
disputesRouter.get("/:disputeId", async (req: Request, res: Response) => {
  const requestId = tagSentryWithRequestId(req);
  const dispute = await disputeService.getDispute(req.params.disputeId, { requestId });
  if (!dispute) {
    return res.status(404).json({
      error: { code: "DISPUTE_NOT_FOUND", message: `Dispute not found: ${req.params.disputeId}` },
    });
  }
  return res.json({ dispute });
});

// POST /api/disputes/:disputeId/escalate
disputesRouter.post("/:disputeId/escalate", async (req: Request, res: Response) => {
  const requestId = tagSentryWithRequestId(req);
  try {
    const dispute = await trackFinancialOperation(
      "dispute.transition",
      () => disputeService.transition(req.params.disputeId, "escalate", { requestId }),
      { disputeId: req.params.disputeId, event: "escalate", requestId: requestId ?? "" },
    );
    return res.json({ dispute });
  } catch (err) {
    return handleAppError(err, res);
  }
});

// POST /api/disputes/:disputeId/resolve
disputesRouter.post("/:disputeId/resolve", async (req: Request, res: Response) => {
  const requestId = tagSentryWithRequestId(req);
  const { resolution } = resolveBodySchema.parse(req.body || {});

  try {
    const dispute = await trackFinancialOperation(
      "dispute.transition",
      () => disputeService.transition(req.params.disputeId, "resolve", { resolution, requestId }),
      { disputeId: req.params.disputeId, event: "resolve", requestId: requestId ?? "" },
    );
    return res.json({ dispute });
  } catch (err) {
    return handleAppError(err, res);
  }
});

// POST /api/disputes/:disputeId/withdraw
disputesRouter.post("/:disputeId/withdraw", async (req: Request, res: Response) => {
  const requestId = tagSentryWithRequestId(req);
  try {
    const dispute = await trackFinancialOperation(
      "dispute.transition",
      () => disputeService.transition(req.params.disputeId, "withdraw", { requestId }),
      { disputeId: req.params.disputeId, event: "withdraw", requestId: requestId ?? "" },
    );
    return res.json({ dispute });
  } catch (err) {
    return handleAppError(err, res);
  }
});
