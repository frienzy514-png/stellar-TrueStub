import type { NextFunction, Request, Response } from "express";
import { firebaseAuth } from "../lib/firebase-admin";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

async function authenticate(req: Request, res: Response): Promise<boolean> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization header is required" });
    return false;
  }

  try {
    res.locals.user = await firebaseAuth.verifyIdToken(authHeader.slice("Bearer ".length));
    return true;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return false;
  }
}

/**
 * Rejects requests without a valid Firebase ID token (`Authorization: Bearer <token>`)
 * with 401. On success the decoded token is exposed as `res.locals.user`.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(await authenticate(req, res))) return;
  return next();
}

/** Verifies a Firebase token and requires its server-issued admin role claim. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!(await authenticate(req, res))) return;

  const user = res.locals.user as {
    role?: unknown;
    "https://hasura.io/jwt/claims"?: { "x-hasura-role"?: unknown };
  };
  const role = user.role ?? user["https://hasura.io/jwt/claims"]?.["x-hasura-role"];

  if (role !== "admin") {
    return res.status(403).json({ error: "Administrator access is required" });
  }

  return next();
}

/** Like `requireAuth`, but lets read-only requests (GET/HEAD/OPTIONS) through. */
export function requireAuthForWrites(req: Request, res: Response, next: NextFunction) {
  if (READ_METHODS.has(req.method)) return next();
  return requireAuth(req, res, next);
}
