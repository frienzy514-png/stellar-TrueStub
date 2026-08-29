import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { env } from "./env";

/**
 * Firebase Admin App — initialized once at startup.
 *
 * Reuses the singleton if already initialized (via getApps()[0]).
 * Credentials come from validated environment variables (see config/env.ts).
 */
const firebaseAdminApp: App =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });

export { firebaseAdminApp };

/**
 * Firebase Auth client — for ID token verification and user management.
 *
 * Exported for use in route handlers (e.g., `firebaseAuth.verifyIdToken(token)`, `firebaseAuth.getUser(uid)`).
 * Routes should never log or return credentials or the full token.
 */
export const firebaseAuth: Auth = getAuth(firebaseAdminApp);
