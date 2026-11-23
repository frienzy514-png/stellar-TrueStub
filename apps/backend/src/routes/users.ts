import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { DecodedIdToken } from "firebase-admin/auth";
import { firebaseAuth } from "../lib/firebase-admin";
import { hasuraRequest } from "../lib/hasura";
import { registerRoute } from "../lib/openapi";
import { changelogService } from "../services/changelog.service";
import { CHANGELOG_ENTRY_TYPES } from "../services/changelog-taxonomy";

export const usersRouter = Router();

/**
 * Anonymize the user's row in `users` and soft-delete related records.
 *
 * This mirrors the pattern in sync-user.ts: the backend holds the
 * admin-secret and performs the Hasura write server-side so the secret
 * is never exposed to the browser.
 *
 * What this does:
 *   1. Verifies the caller's Firebase ID token (via `requireAuth` at the
 *      mount in index.ts, with `resolveUser` below as a fallback).
 *   2. Looks up the Hasura user row by email.
 *   3. Anonymizes PII columns (email, first_name, last_name, phone_number,
 *      profile_image_url, summary, location) and marks the row deleted.
 *   4. Records a permanent `account.deleted` changelog entry keyed by the
 *      Firebase uid (no PII — the service seals the timestamp).
 *   5. Deletes the Firebase Auth account so the user cannot sign back in.
 *
 * ## Cascade deletion / data-retention policy (closes #394)
 *
 * When a user requests deletion, the following deliberate policy applies to
 * each category of related data.  Every decision is intentional and must be
 * kept in sync with any future schema changes.
 *
 * ### users row
 *   ANONYMIZED — PII columns (email, first_name, last_name, phone_number,
 *   profile_image_url, summary, location, country_code) are set to NULL and
 *   `deleted_at` is stamped.  The row itself is retained (soft-delete) so
 *   that foreign-key references from escrows, listings, and reviews remain
 *   valid.  The orphaned row carries no identifying information after
 *   anonymization.
 *
 * ### ticket_listings
 *   RETAINED + ANONYMIZED BY CASCADE — listings are kept for market-history
 *   and dispute-audit purposes.  Their `seller_id` foreign key still points
 *   to the now-anonymized users row, so the listing record is automatically
 *   detached from identifying information.  No separate mutation is required;
 *   the anonymization of the users row is sufficient.
 *
 *   If a listing is in an active state (e.g., `listed`, `pending_sale`) at
 *   deletion time, any in-flight escrow for that listing must be resolved
 *   before or after deletion — Hasura row-level security prevents a deleted
 *   user from creating new listings but does not force-cancel active ones.
 *   A future improvement (#TBD) should add a `cancel_active_listings_on_delete`
 *   Hasura event trigger to handle this automatically.
 *
 * ### escrows (ticket_escrow_transactions)
 *   RETAINED for auditability / legal compliance — on-chain transactions are
 *   immutable by nature.  The backend never deletes escrow records; they are
 *   retained indefinitely with `buyer_id`/`seller_id` still pointing to the
 *   anonymized users row.  Staff/support dashboards must not display the
 *   deleted user's PII (already gone) to other parties.
 *
 * ### reviews (reviews table)
 *   RETAINED (content) + ANONYMIZED (reviewer identity) BY CASCADE — the
 *   review text, rating, and timestamp are kept so the reviewed party's
 *   reputation score remains meaningful.  `reviewer_id` is a foreign key to
 *   the users row; once that row is anonymized, queries that JOIN on it will
 *   find NULL for all PII columns, effectively surfacing "Anonymous" in the
 *   UI.  No separate mutation is required.
 *
 *   Reviews left *about* the deleted user (where `reviewee_id` = deleted user)
 *   are similarly retained: they contribute to the historical record and
 *   become associated with the now-anonymous reviewee row.
 *
 * ### ratings
 *   Same policy as reviews — retained for historical integrity, anonymized
 *   by cascade through the users foreign key.
 *
 * ### notifications
 *   NOT retained — notifications are user-facing and have no audit value
 *   after account deletion.  A `DELETE FROM notifications WHERE user_id = ?`
 *   should be added as a future improvement (#TBD) so stale notification rows
 *   are cleaned up.  Today they remain orphaned but inaccessible (the Firebase
 *   Auth account is gone so no client can authenticate to read them).
 *
 * ### Firebase Auth account
 *   HARD DELETED — `firebaseAuth.deleteUser(uid)` is called last.  If this
 *   fails after Hasura anonymization succeeds, the inconsistency is logged
 *   loudly for manual cleanup.  The PII is already gone from Hasura at that
 *   point, so the risk is limited to a zombie Firebase entry with no
 *   linked data.
 */

const ANONYMIZE_USER = `
  mutation AnonymizeUser($email: String!, $deletedAt: timestamptz!) {
    update_users(
      where: { email: { _eq: $email } }
      _set: {
        first_name: null
        last_name: null
        phone_number: null
        profile_image_url: null
        summary: null
        location: null
        country_code: null
        email: null
        deleted_at: $deletedAt
      }
    ) {
      affected_rows
    }
  }
`;

interface AnonymizeUserResult {
  update_users: {
    affected_rows: number;
  };
}

// Zod schemas describing this route's request/response shapes. They are the
// single source of truth for both runtime validation and the generated
// OpenAPI spec (see ../lib/openapi), so the docs cannot drift from the code.
const deleteMeResponseSchema = z.object({
  success: z.boolean(),
  deleted: z.boolean(),
});

const deleteMeErrorSchema = z.object({
  error: z.string(),
});

registerRoute({
  method: "delete",
  path: "/api/users/me",
  summary: "Anonymize and delete the authenticated user",
  description:
    "Anonymizes the caller's PII in Hasura and deletes their Firebase Auth account.",
  request: {
    headers: z.object({
      authorization: z.string().describe("Bearer <Firebase ID token>"),
    }),
  },
  responses: {
    200: {
      description: "User anonymized and deleted",
      content: { "application/json": { schema: deleteMeResponseSchema } },
    },
    400: {
      description: "Firebase account has no email",
      content: { "application/json": { schema: deleteMeErrorSchema } },
    },
    401: {
      description: "Missing, invalid, or expired token",
      content: { "application/json": { schema: deleteMeErrorSchema } },
    },
    502: {
      description: "Failed to remove user data",
      content: { "application/json": { schema: deleteMeErrorSchema } },
    },
  },
});

// Zod schemas for the review creation route.
const createReviewBodySchema = z.object({
  revieweeId: z.string().describe("The user being reviewed"),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

const createReviewResponseSchema = z.object({
  success: z.boolean(),
  reviewId: z.string().optional(),
});

const createReviewErrorSchema = z.object({
  error: z.string(),
});

const INSERT_REVIEW = `
  mutation InsertReview(
    $reviewerId: uuid!
    $revieweeId: uuid!
    $rating: Int!
    $comment: String
  ) {
    insert_reviews_one(
      object: {
        reviewer_id: $reviewerId
        reviewee_id: $revieweeId
        rating: $rating
        comment: $comment
      }
    ) {
      id
    }
  }
`;

interface InsertReviewResult {
  insert_reviews_one: {
    id: string;
  } | null;
}

registerRoute({
  method: "post",
  path: "/api/users/reviews",
  summary: "Create a review for another user",
  description:
    "Creates a review. A user cannot review themselves; self-reviews are rejected with 400.",
  request: {
    headers: z.object({
      authorization: z.string().describe("Bearer <Firebase ID token>"),
    }),
    body: { content: { "application/json": { schema: createReviewBodySchema } } },
  },
  responses: {
    201: {
      description: "Review created",
      content: { "application/json": { schema: createReviewResponseSchema } },
    },
    400: {
      description: "Invalid request or self-review attempt",
      content: { "application/json": { schema: createReviewErrorSchema } },
    },
    401: {
      description: "Missing, invalid, or expired token",
      content: { "application/json": { schema: createReviewErrorSchema } },
    },
    502: {
      description: "Failed to persist review",
      content: { "application/json": { schema: createReviewErrorSchema } },
    },
  },
});

/**
 * Returns the caller's decoded Firebase token.
 *
 * `/api/users` is mounted behind `requireAuth` in index.ts (#528), which puts
 * the verified token on `res.locals.user`. When that is present we reuse it.
 * Otherwise (e.g. the router mounted on its own in a test) the token is
 * verified here, so a handler is never reachable without authentication.
 * Sends the 401 itself and returns `null` when the caller is not authenticated.
 */
async function resolveUser(
  req: Request,
  res: Response,
  context: string
): Promise<DecodedIdToken | null> {
  if (res.locals.user) return res.locals.user as DecodedIdToken;

  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization header is required" });
    return null;
  }

  try {
    return await firebaseAuth.verifyIdToken(authHeader.slice("Bearer ".length));
  } catch (error) {
    console.error(`${context}: token verification failed`, error);
    res.status(401).json({ error: "Invalid or expired token" });
    return null;
  }
}

usersRouter.post("/reviews", async (req, res) => {
  const decoded = await resolveUser(req, res, "create-review");
  if (!decoded) return;

  const parsed = createReviewBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid review payload" });
  }

  const { revieweeId, rating, comment } = parsed.data;

  // Self-review guard: reject before any Hasura/DB write so no row is created.
  if (revieweeId === decoded.uid) {
    return res.status(400).json({ error: "You cannot review yourself" });
  }

  try {
    const result = await hasuraRequest<InsertReviewResult>(INSERT_REVIEW, {
      reviewerId: decoded.uid,
      revieweeId,
      rating,
      comment: comment ?? null,
    });

    return res.status(201).json({
      success: true,
      reviewId: result.insert_reviews_one?.id,
    });
  } catch (error) {
    console.error("create-review: hasura insert failed", error);
    return res.status(502).json({ error: "Failed to persist review" });
  }
});

usersRouter.delete("/me", async (req, res) => {
  const decoded = await resolveUser(req, res, "delete-user");
  if (!decoded) return;

  if (!decoded.email) {
    return res.status(400).json({ error: "Firebase account has no email" });
  }

  const deletedAt = new Date().toISOString();

  try {
    // Anonymize the Hasura row first. If this fails we abort before touching
    // Firebase Auth, so the user can retry.
    await hasuraRequest<AnonymizeUserResult>(ANONYMIZE_USER, {
      email: decoded.email,
      deletedAt,
    });
  } catch (error) {
    console.error("delete-user: hasura anonymization failed", error);
    return res.status(502).json({ error: "Failed to remove user data" });
  }

  try {
    // Audit the deletion. Only the uid and reason are recorded — never the
    // email or other PII that was just anonymized. The entryId is derived from
    // the uid so a retried request (e.g. after a Firebase failure below)
    // reuses the existing entry instead of hitting the write-once guard.
    const entryId = `${CHANGELOG_ENTRY_TYPES.ACCOUNT_DELETED}:${decoded.uid}`;
    if (!(await changelogService.getEntry(entryId))) {
      await changelogService.appendEntry({
        entryId,
        action: CHANGELOG_ENTRY_TYPES.ACCOUNT_DELETED,
        actorId: decoded.uid,
        resourceId: decoded.uid,
        metadata: { reason: "user_request" },
      });
    }
  } catch (error) {
    // The anonymization already happened, so don't fail the request — but
    // flag the missing audit line for manual follow-up.
    console.error(
      "delete-user: changelog audit entry failed after hasura anonymization for uid",
      decoded.uid,
      error
    );
  }

  try {
    // Remove the Firebase Auth account. This is the final step: once done the
    // user cannot sign back in, so Hasura-side is the point of no return.
    await firebaseAuth.deleteUser(decoded.uid);
  } catch (error) {
    // Firebase deletion failing after a successful Hasura anonymization is an
    // inconsistent state but not catastrophic — the PII is already gone.
    // Log loudly and return success so the frontend proceeds to sign out.
    console.error(
      "delete-user: firebase auth deletion failed after hasura anonymization — manual cleanup required for uid",
      decoded.uid,
      error
    );
  }

  return res.status(200).json({ success: true, deleted: true });
});
