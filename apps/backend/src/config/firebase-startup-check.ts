import { firebaseAuth } from "../lib/firebase-admin";
import { env } from "./env";

const PROBE_UID = "startup-connectivity-probe-do-not-create";

/**
 * Fail-fast check for the Firebase Admin SDK credentials (#567).
 *
 * Env-presence validation cannot detect a project ID / client email / private
 * key trio that is individually present but mismatched. A lookup of a
 * nonexistent user only succeeds past credential verification: valid
 * credentials yield `auth/user-not-found`, while broken ones yield a different
 * error (invalid credential, wrong project, etc.).
 */
export async function assertFirebaseAdminConfigured(): Promise<void> {
  if (env.NODE_ENV === "test") return;

  try {
    await firebaseAuth.getUser(PROBE_UID);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "auth/user-not-found") return;

    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Firebase Admin SDK credentials are invalid for project "${env.FIREBASE_ADMIN_PROJECT_ID}" ` +
        `(client ${env.FIREBASE_ADMIN_CLIENT_EMAIL}): ${reason}`,
    );
  }
}
