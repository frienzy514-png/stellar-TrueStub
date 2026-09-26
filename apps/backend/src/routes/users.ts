import { Router } from "express";
import { firebaseAuth } from "../lib/firebase-admin";
import { hasuraRequest } from "../lib/hasura";

export const usersRouter = Router();

/**
 * Anonymize the user's row in `users` and soft-delete related records.
 *
 * This mirrors the pattern in sync-user.ts: the backend holds the
 * admin-secret and performs the Hasura write server-side so the secret
 * is never exposed to the browser.
 *
 * What this does:
 *   1. Verifies the caller's Firebase ID token.
 *   2. Looks up the Hasura user row by email.
 *   3. Anonymizes PII columns (email, first_name, last_name, phone_number,
 *      profile_image_url, summary, location) and marks the row deleted.
 *   4. Deletes the Firebase Auth account so the user cannot sign back in.
 *
 * Ticket listings and escrow records are intentionally retained for
 * auditability; the anonymization step detaches them from personally
 * identifiable information.
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

usersRouter.delete("/me", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header is required" });
  }

  const token = authHeader.slice("Bearer ".length);

  let decoded;
  try {
    decoded = await firebaseAuth.verifyIdToken(token);
  } catch (error) {
    console.error("delete-user: token verification failed", error);
    return res.status(401).json({ error: "Invalid or expired token" });
  }

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
