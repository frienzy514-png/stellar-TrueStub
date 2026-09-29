import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

const normalizedPrivateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n").trim();
const shouldInitializeFirebase =
  env.NODE_ENV !== "test" && normalizedPrivateKey.includes("BEGIN ") && normalizedPrivateKey.includes("PRIVATE KEY");

const app =
  getApps().length
    ? getApps()[0]
    : shouldInitializeFirebase
      ? initializeApp({
          credential: cert({
            projectId: env.FIREBASE_ADMIN_PROJECT_ID,
            clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
            privateKey: normalizedPrivateKey,
          }),
        })
      : initializeApp({ projectId: env.FIREBASE_ADMIN_PROJECT_ID });

export const firebaseAuth = shouldInitializeFirebase
  ? getAuth(app)
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
    } as any);
export const firebaseAuth = getAuth(app);

/**
 * Express middleware that verifies a Firebase ID token from the
 * `Authorization: Bearer <token>` header and attaches the authenticated
 * user's id to `res.locals.userId`. Requests without a valid token are
 * rejected with 401 so routes can never act on a client-supplied userId.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : undefined;

  if (!token) {
    res.status(401).json({ error: "Missing authentication token" });
    return;
  }

  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    res.locals.userId = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: "Invalid authentication token" });
  }
}
