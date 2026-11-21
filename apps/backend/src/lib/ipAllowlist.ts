import { BlockList, isIP } from "net";

/**
 * Pure IP/CIDR allowlist parser (#532). Kept free of logger/env imports so
 * config/env.ts can use it to validate TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS at
 * startup without a circular dependency.
 */

export interface IpAllowlist {
  /** The raw entries the list was built from. */
  entries: string[];
  check(ip: string | undefined): boolean;
}

/** Strip the IPv4-mapped IPv6 prefix Node uses on dual-stack sockets. */
function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  return trimmed.toLowerCase().startsWith("::ffff:") && isIP(trimmed.slice(7)) === 4
    ? trimmed.slice(7)
    : trimmed;
}

/**
 * Parses a comma-separated list of IPv4/IPv6 addresses and CIDR ranges.
 * Throws on any malformed entry so a typo fails at startup instead of
 * silently locking out (or letting in) webhook traffic.
 */
export function parseIpAllowlist(raw: string): IpAllowlist {
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error("IP allowlist is empty");
  }

  const list = new BlockList();
  for (const entry of entries) {
    const [address, prefix, ...rest] = entry.split("/");
    const family = isIP(address);
    if (!family || rest.length > 0) {
      throw new Error(`Invalid IP allowlist entry: "${entry}"`);
    }
    const type = family === 4 ? "ipv4" : "ipv6";

    if (prefix === undefined) {
      list.addAddress(address, type);
      continue;
    }

    const bits = Number(prefix);
    const maxBits = family === 4 ? 32 : 128;
    if (!/^\d+$/.test(prefix) || bits < 0 || bits > maxBits) {
      throw new Error(`Invalid CIDR prefix in IP allowlist entry: "${entry}"`);
    }
    list.addSubnet(address, bits, type);
  }

  return {
    entries,
    check(ip) {
      if (!ip) return false;
      const normalized = normalizeIp(ip);
      const family = isIP(normalized);
      if (!family) return false;
      return list.check(normalized, family === 4 ? "ipv4" : "ipv6");
    },
  };
}
