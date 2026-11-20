import { Router } from "express";
import { z } from "zod";
import { assessListingRisk } from "../services/listing-fraud.service";
import { listingAlertService } from "../services/listing-alert.service";
import { registerRoute } from "../openapi/registry";
import { requireAuthForWrites } from "../middleware/auth";
import { HasuraService } from "../services/hasura.service";
import { cleanupListingDependentDocuments } from "../services/listing-deletion.service";

export const listingsRouter = Router();

// Auth for write methods (POST/PATCH/DELETE) is enforced in the route file
// itself (matching the users.ts pattern) rather than being applied as
// mount-time middleware in index.ts (issue #369).
listingsRouter.use(requireAuthForWrites);

const listingSchema = z.object({
  id: z.string().optional(),
  eventName: z.string().min(1),
  eventDate: z.string().optional(),
  section: z.string().optional(),
  row: z.string().optional(),
  seat: z.string().optional(),
  sellerId: z.string().min(1),
  status: z.string().optional(),
});

const riskCheckSchema = z.object({
  listing: listingSchema,
  existingListings: z.array(listingSchema).default([]),
});

registerRoute({
  method: "post",
  path: "/api/listings/risk-check",
  summary: "Assess fraud risk for a listing",
  request: { body: riskCheckSchema },
});

listingsRouter.post("/risk-check", (req, res) => {
  const parsed = riskCheckSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid listing risk-check payload",
      details: parsed.error.flatten(),
    });
  }

  return res.json(assessListingRisk(parsed.data.listing, parsed.data.existingListings));
});

const createListingSchema = z.object({
  id: z.string().min(1),
  eventName: z.string().min(1),
  price: z.number().nonnegative(),
  section: z.string().optional(),
  status: z.string().optional(),
});

registerRoute({
  method: "post",
  path: "/api/listings",
  summary: "Create a listing and notify matching saved searches",
  request: { body: createListingSchema },
});

// #187 — a newly created listing triggers alerts for matching saved searches.
// #333 — the same creation path also matches registered saved searches and
// notifies each search's owner via notification.service.ts.
listingsRouter.post("/", async (req, res, next) => {
  const parsed = createListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid listing payload", details: parsed.error.flatten() });
  }
  try {
    const notifiedSearchIds = await listingAlertService.notifyNewListing(parsed.data);
    const savedSearchMatches = await listingAlertService.notifySavedSearchMatches(parsed.data);
    return res.status(201).json({ listing: parsed.data, notifiedSearchIds, savedSearchMatches });
  } catch (err) {
    return next(err);
  }
});

const updateListingSchema = z.object({
  eventName: z.string().min(1),
  price: z.number().nonnegative(),
  previousPrice: z.number().nonnegative().optional(),
  section: z.string().optional(),
  status: z.string().optional(),
});

registerRoute({
  method: "patch",
  path: "/api/listings/{id}",
  summary: "Update a listing and notify watchers",
  request: { params: z.object({ id: z.string() }), body: updateListingSchema },
});

// #406 — escrow states that lock a listing's price/terms. Once a buyer has
// committed funds (or the escrow has completed), the seller must not be able
// to retroactively change the terms the buyer agreed to.
const LOCKING_ESCROW_STATUSES = ["active", "in_progress", "funded", "completed"];

async function findLockingEscrow(listingId: string) {
  const escrowService = (await import("../services/escrow.service")) as {
    escrowService?: { findByListingId?: (id: string) => Promise<unknown> | unknown };
  };
  const service = escrowService.escrowService;
  if (!service?.findByListingId) {
    return null;
  }
  const escrows = await service.findByListingId(listingId);
  const list = Array.isArray(escrows) ? escrows : escrows ? [escrows] : [];
  return (
    list.find((escrow) => {
      const status = (escrow as { status?: string } | null)?.status;
      return typeof status === "string" && LOCKING_ESCROW_STATUSES.includes(status);
    }) ?? null
  );
}

// #189 — price change / about-to-sell notifies watchers of the listing.
// #406 — reject price/terms edits while an escrow is active or completed.
listingsRouter.patch("/:id", async (req, res, next) => {
  const parsed = updateListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid listing update", details: parsed.error.flatten() });
  }
  try {
    const lockingEscrow = await findLockingEscrow(req.params.id);
    if (lockingEscrow) {
      return res.status(409).json({
        error:
          "Listing has an active or completed escrow; price and terms cannot be edited. Create a new listing instead.",
        code: "LISTING_ESCROW_LOCKED",
      });
    }
    const { previousPrice, ...listing } = parsed.data;
    const notified = await listingAlertService.notifyListingUpdate(
      { ...listing, id: req.params.id },
      previousPrice
    );
    return res.json({ listingId: req.params.id, notified });
  } catch (err) {
    return next(err);
  }
});

registerRoute({
  method: "delete",
  path: "/api/listings/{id}",
  summary: "Delete a listing when no escrow or dispute references it",
  request: { params: z.object({ id: z.coerce.number().int().positive() }) },
});

listingsRouter.delete("/:id", async (req, res, next) => {
  const parsedId = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!parsedId.success) {
    return res.status(400).json({ error: "Invalid listing id" });
  }

  const user = res.locals.user as { uid?: string } | undefined;
  if (!user?.uid) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const deleted = await HasuraService.deleteTicketListing(parsedId.data, user.uid);
    if (!deleted) {
      return res.status(404).json({ error: "Listing not found" });
    }

    await cleanupListingDependentDocuments(String(parsedId.data));
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});
