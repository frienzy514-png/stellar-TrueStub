/**
 * Saved-search (#187) and watchlist (#189) endpoints.
 *
 *   POST   /api/saved-searches           create a saved search
 *   GET    /api/saved-searches           list the caller's saved searches
 *   DELETE /api/saved-searches/:id
 *   POST   /api/watchlist                watch a listing
 *   GET    /api/watchlist?userId=
 *   DELETE /api/watchlist/:listingId?userId=
 *   POST   /api/watchlist/price-check    run the watchlist price-change job (#334)
 */

import { Router } from "express";
import { z } from "zod";
import { listingAlertService } from "../services/listing-alert.service";
import { verifyIdToken } from "../services/auth.service";

export const savedSearchesRouter = Router();
export const watchlistRouter = Router();

const searchSchema = z.object({
  eventName: z.string().min(1),
  maxPrice: z.number().positive().optional(),
  section: z.string().optional(),
  email: z.string().email().optional(),
  pushToken: z.string().optional(),
});

const watchSchema = z.object({
  listingId: z.string().min(1),
  eventName: z.string().optional(),
  price: z.number().nonnegative().optional(),
  email: z.string().email().optional(),
  pushToken: z.string().optional(),
});

const priceCheckSchema = z.object({
  listingId: z.string().min(1),
  currentPrice: z.number().nonnegative(),
});

const userIdOf = (q: unknown) => (typeof q === "string" && q ? q : undefined);

savedSearchesRouter.post("/", async (req, res) => {
  const userId = await authenticatedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid saved search", details: parsed.error.flatten() });
  }
  return res.status(201).json(listingAlertService.createSearch({ ...parsed.data, userId }));
});

savedSearchesRouter.get("/", async (req, res) => {
  const userId = await authenticatedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  return res.json(listingAlertService.listSearches(userId));
});

savedSearchesRouter.delete("/:id", async (req, res) => {
  const userId = await authenticatedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  return listingAlertService.deleteSearch(req.params.id, userId)
    ? res.status(204).end()
    : res.status(404).json({ error: "Saved search not found" });
});

watchlistRouter.post("/", async (req, res) => {
  const userId = await authenticatedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const parsed = watchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid watchlist payload", details: parsed.error.flatten() });
  }
  return res.status(201).json(listingAlertService.watch({ ...parsed.data, userId }));
});

watchlistRouter.get("/", async (req, res) => {
  const userId = await authenticatedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  return res.json(listingAlertService.listWatched(userId));
});

watchlistRouter.delete("/:listingId", async (req, res) => {
  const userId = await authenticatedUserId(req);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  return listingAlertService.unwatch(userId, req.params.listingId)
    ? res.status(204).end()
    : res.status(404).json({ error: "Not on watchlist" });
});

/**
 * Watchlist price-change job (#334).
 *
 * Compares a watched listing's current price against the price recorded at
 * watch-time and notifies every watcher whose saved price differs. Intended to
 * be invoked by the backend scheduler whenever a listing's price is updated.
 */
watchlistRouter.post("/price-check", async (req, res) => {
  const parsed = priceCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid price check payload", details: parsed.error.flatten() });
  }
  const notifications = await listingAlertService.checkPriceChange(
    parsed.data.listingId,
    parsed.data.currentPrice
  );
  return res.json({ notifications });
});
