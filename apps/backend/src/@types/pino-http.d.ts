/**
 * Augments Express's Request interface with the `log` property that
 * pino-http attaches to every request. This allows `req.log` to be used
 * in route handlers and error-handling middleware without a type cast.
 */
import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      log: Logger;
    }
  }
}
