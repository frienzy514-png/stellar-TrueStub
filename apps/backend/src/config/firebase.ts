import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { env } from "./env";

const normalizedPrivateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n").trim();
const shouldInitializeFirebase =
  env.NODE_ENV !== "test" && normalizedPrivateKey.includes("BEGIN ") && normalizedPrivateKey.includes("PRIVATE KEY");

/**
 * Firebase Admin App — initialized once at startup.
 *
 * Reuses the singleton if already initialized (via getApps()[0]).
 * In Jest we skip credential-based initialization so tests can import the app
 * without a valid service-account PEM.
 */
const firebaseAdminApp: App =
  getApps()[0] ??
  (shouldInitializeFirebase
    ? initializeApp({
        credential: cert({
          projectId: env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: normalizedPrivateKey,
        }),
      })
    : initializeApp({ projectId: env.FIREBASE_ADMIN_PROJECT_ID }));

export { firebaseAdminApp };

/**
 * Firebase Auth client — for ID token verification and user management.
 *
 * Exported for use in route handlers (e.g., `firebaseAuth.verifyIdToken(token)`, `firebaseAuth.getUser(uid)`).
 * Routes should never log or return credentials or the full token.
 */
export const firebaseAuth: Auth = shouldInitializeFirebase
  ? getAuth(firebaseAdminApp)
  : ({
      verifyIdToken: async () => {
        throw new Error("Firebase Admin is disabled in test mode");
      },
      getUser: async () => {
        throw new Error("Firebase Admin is disabled in test mode");
      },
      deleteUser: async () => {
        throw new Error("Firebase Admin is disabled in test mode");
      },
    } as unknown as Auth);
