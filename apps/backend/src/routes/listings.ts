import { Router } from "express";
import { z } from "zod";
import { assessListingRisk } from "../services/listing-fraud.service";
import { listingAlertService } from "../services/listing-alert.service";

export const listingsRouter = Router();

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

// #187 — a newly created listing triggers alerts for matching saved searches.
listingsRouter.post("/", async (req, res, next) => {
  const parsed = createListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid listing payload", details: parsed.error.flatten() });
  }
  try {
    const notifiedSearchIds = await listingAlertService.notifyNewListing(parsed.data);
    return res.status(201).json({ listing: parsed.data, notifiedSearchIds });
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

// #189 — price change / about-to-sell notifies watchers of the listing.
listingsRouter.patch("/:id", async (req, res, next) => {
  const parsed = updateListingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid listing update", details: parsed.error.flatten() });
  }
  try {
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
