import { Router } from "express";
import { firebaseAuth } from "../lib/firebase-admin";
import { hasuraRequest } from "../lib/hasura";

export const syncUserRouter = Router();

// `users_email_key` is a guess (Postgres's default naming for a
// single-column unique constraint on `email`) — this repo has no Hasura
// metadata or SQL migrations to confirm it against. `email`, `first_name`
// and `last_name` are the only `users` columns proven to exist anywhere in
// the codebase (see src/graphql/mutations/test-user.ts in the frontend).
// If Hasura rejects this constraint name, the upsert fails loudly (502
// below) rather than silently — fix the constraint name here once someone
// with real schema access confirms it.
const UPSERT_USER = `
  mutation SyncUser($email: String!, $firstName: String, $lastName: String) {
    insert_users_one(
      object: { email: $email, first_name: $firstName, last_name: $lastName }
      on_conflict: {
        constraint: users_email_key
        update_columns: [first_name, last_name]
      }
    ) {
      id
      email
      first_name
      last_name
      created_at
      updated_at
    }
  }
`;

interface SyncUserResult {
  insert_users_one: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    created_at: string;
    updated_at: string;
  };
}

syncUserRouter.post("/", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header is required" });
  }

  const token = authHeader.slice("Bearer ".length);

  let decoded;
  try {
    decoded = await firebaseAuth.verifyIdToken(token);
  } catch (error) {
    console.error("sync-user: token verification failed", error);
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  if (!decoded.email) {
    return res.status(400).json({ error: "Firebase account has no email" });
  }

  const firstName =
    typeof req.body?.first_name === "string" ? req.body.first_name : undefined;
  const lastName =
    typeof req.body?.last_name === "string" ? req.body.last_name : undefined;

  try {
    const data = await hasuraRequest<SyncUserResult>(UPSERT_USER, {
      email: decoded.email,
      firstName,
      lastName,
    });

    return res.status(200).json({
      success: true,
      synced: true,
      user: data.insert_users_one,
    });
  } catch (error) {
    console.error("sync-user: hasura upsert failed", error);
    return res.status(502).json({ error: "Failed to sync user" });
  }
});
