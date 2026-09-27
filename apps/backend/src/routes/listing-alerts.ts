/**
 * Saved-search (#187) and watchlist (#189) endpoints.
 *
 *   POST   /api/saved-searches           create a saved search
 *   GET    /api/saved-searches?userId=   list a user's saved searches
 *   DELETE /api/saved-searches/:id?userId=
 *   POST   /api/saved-searches/match     match a new listing against saved searches (#333)
 *   POST   /api/watchlist                watch a listing
 *   GET    /api/watchlist?userId=
 *   DELETE /api/watchlist/:listingId?userId=
 */

import { Router } from "express";
import { z } from "zod";
import { listingAlertService } from "../services/listing-alert.service";
import { notificationService } from "../services/notification.service";

export const savedSearchesRouter = Router();
export const watchlistRouter = Router();

const searchSchema = z.object({
  userId: z.string().min(1),
  eventName: z.string().min(1),
  maxPrice: z.number().positive().optional(),
  section: z.string().optional(),
  email: z.string().email().optional(),
  pushToken: z.string().optional(),
});

const watchSchema = z.object({
  userId: z.string().min(1),
  listingId: z.string().min(1),
  eventName: z.string().optional(),
  price: z.number().nonnegative().optional(),
  email: z.string().email().optional(),
  pushToken: z.string().optional(),
});

const matchSchema = z.object({
  listingId: z.string().min(1),
  eventName: z.string().min(1),
  price: z.number().nonnegative().optional(),
  section: z.string().optional(),
});

const userIdOf = (q: unknown) => (typeof q === "string" && q ? q : undefined);

savedSearchesRouter.post("/", (req, res) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid saved search", details: parsed.error.flatten() });
  }
  return res.status(201).json(listingAlertService.createSearch(parsed.data));
});

savedSearchesRouter.get("/", (req, res) => {
  const userId = userIdOf(req.query.userId);
  if (!userId) return res.status(400).json({ error: "userId is required" });
  return res.json(listingAlertService.listSearches(userId));
});

savedSearchesRouter.delete("/:id", (req, res) => {
  const userId = userIdOf(req.query.userId);
  if (!userId) return res.status(400).json({ error: "userId is required" });
  return listingAlertService.deleteSearch(req.params.id, userId)
    ? res.status(204).end()
    : res.status(404).json({ error: "Saved search not found" });
});

/**
 * Match a newly created listing against every registered saved search and
 * notify each matching search's owner. Invoked on new-listing creation (or by
 * a periodic sweep) so a registered search actually fires a notification.
 */
savedSearchesRouter.post("/match", async (req, res) => {
  const parsed = matchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid listing", details: parsed.error.flatten() });
  }

  const { listingId, eventName, price, section } = parsed.data;
  const matches = listingAlertService
    .listAllSearches()
    .filter((search) => {
      if (search.eventName !== eventName) return false;
      if (search.maxPrice !== undefined && price !== undefined && price > search.maxPrice) return false;
      if (search.section !== undefined && section !== undefined && search.section !== section) return false;
      return true;
    });

  const notified = await Promise.all(
    matches.map(async (search) => {
      await notificationService.send({
        userId: search.userId,
        type: "saved_search_match",
        title: `New match for "${search.eventName}"`,
        body: `A new listing matching your saved search is available.`,
        data: { listingId, savedSearchId: search.id },
        email: search.email,
        pushToken: search.pushToken,
      });
      return search.id;
    }),
  );

  return res.json({ listingId, matched: notified.length, savedSearchIds: notified });
});

watchlistRouter.post("/", (req, res) => {
  const parsed = watchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid watchlist payload", details: parsed.error.flatten() });
  }
  return res.status(201).json(listingAlertService.watch(parsed.data));
});

watchlistRouter.get("/", (req, res) => {
  const userId = userIdOf(req.query.userId);
  if (!userId) return res.status(400).json({ error: "userId is required" });
  return res.json(listingAlertService.listWatched(userId));
});

watchlistRouter.delete("/:listingId", (req, res) => {
  const userId = userIdOf(req.query.userId);
  if (!userId) return res.status(400).json({ error: "userId is required" });
  return listingAlertService.unwatch(userId, req.params.listingId)
    ? res.status(204).end()
    : res.status(404).json({ error: "Not on watchlist" });
});
