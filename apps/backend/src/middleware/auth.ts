import type { NextFunction, Request, Response } from "express";
import { firebaseAuth } from "../lib/firebase-admin";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Rejects requests without a valid Firebase ID token (`Authorization: Bearer <token>`)
 * with 401. On success the decoded token is exposed as `res.locals.user`.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header is required" });
  }

  try {
    res.locals.user = await firebaseAuth.verifyIdToken(authHeader.slice("Bearer ".length));
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  return next();
}

/** Like `requireAuth`, but lets read-only requests (GET/HEAD/OPTIONS) through. */
export function requireAuthForWrites(req: Request, res: Response, next: NextFunction) {
  if (READ_METHODS.has(req.method)) return next();
  return requireAuth(req, res, next);
}
