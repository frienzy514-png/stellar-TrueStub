import type { IncomingMessage } from "http";
import type { Request } from "express";

/**
 * `verify` hook for `express.json()` that keeps the unparsed body bytes on
 * `req.rawBody`, so signature checks (e.g. the Trustless Work webhook HMAC)
 * run against exactly what the sender signed.
 */
export function captureRawBody(req: IncomingMessage, _res: unknown, buf: Buffer): void {
  (req as Request).rawBody = buf;
}
