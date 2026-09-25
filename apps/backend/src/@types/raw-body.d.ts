/**
 * Augments Express's Request with the exact bytes of a JSON request body,
 * captured by `captureRawBody` (see middleware/rawBody.ts). HMAC-signed
 * webhooks must be verified against these bytes, not a re-serialization of
 * the parsed `req.body`.
 */
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export {};
