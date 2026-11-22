import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";
import { parseIpAllowlist, type IpAllowlist } from "../lib/ipAllowlist";

/**
 * Optional source-IP allowlist for inbound webhooks (#532).
 *
 * HMAC signature verification (routes/webhooks.ts) is the primary and
 * sufficient control for `/webhooks/escrow-status`. This allowlist is a
 * defense-in-depth layer only: it shrinks the attack surface if the HMAC
 * secret were ever leaked, but it is not an authentication mechanism.
 *
 * Trustless Work does not publish a stable set of webhook source IPs, so the
 * allowlist is opt-in. Leave TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS unset (the
 * default) and only HMAC is enforced. Set it when the deployment has a known,
 * stable set of peers — e.g. the frontend pass-through server, an ingress /
 * load balancer, or IPs confirmed with Trustless Work support.
 *
 * The check matches `req.ip`, i.e. the immediate peer as Express sees it. When
 * the backend sits behind a proxy, list the proxy's address (or configure
 * Express `trust proxy` so `req.ip` reflects the forwarded client address).
 */

/**
 * Express middleware enforcing the allowlist returned by `getRawAllowlist`.
 * The raw value is read per request (and the parsed list cached) so it follows
 * the validated env without requiring a restart-time snapshot in tests.
 */
export function webhookIpAllowlist(
  getRawAllowlist: () => string | undefined,
  webhookName: string
) {
  let cachedRaw: string | undefined;
  let cachedList: IpAllowlist | null = null;

  return (req: Request, res: Response, next: NextFunction) => {
    const raw = getRawAllowlist();
    if (!raw || !raw.trim()) {
      return next();
    }

    if (raw !== cachedRaw) {
      cachedList = parseIpAllowlist(raw);
      cachedRaw = raw;
    }

    if (cachedList!.check(req.ip)) {
      return next();
    }

    logger.warn(
      { ip: req.ip, webhook: webhookName },
      `[webhook:${webhookName}] Rejected delivery from non-allowlisted IP`
    );
    return res.status(403).json({ error: "Forbidden" });
  };
}
