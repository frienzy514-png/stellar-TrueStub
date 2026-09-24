// Lightweight environment-based feature flags.
//
// Each flag is read from a server-side env var `FEATURE_FLAG_<NAME>` at
// *request time* (deliberately not NEXT_PUBLIC_, which is inlined at build),
// so a flag can be flipped by changing the env var and restarting the server —
// no rebuild/redeploy. Client components read flags via `useFeatureFlag`,
// which calls /api/feature-flags.
//
// Truthy: "1", "true", "on", "yes". Falsy: "0", "false", "off", "no".
// Unset/unrecognised values fall back to the default below, so risky changes
// should default to `false` (ship dark) and be enabled per environment.

export const FEATURE_FLAG_DEFAULTS = {
  /** Printable receipt for completed escrows (#197). */
  ESCROW_RECEIPTS: true,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAG_DEFAULTS;

const TRUE_VALUES = new Set(["1", "true", "on", "yes"]);
const FALSE_VALUES = new Set(["0", "false", "off", "no"]);

export function isFeatureEnabled(
  flag: FeatureFlag,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env[`FEATURE_FLAG_${flag}`]?.trim().toLowerCase();
  if (raw && TRUE_VALUES.has(raw)) return true;
  if (raw && FALSE_VALUES.has(raw)) return false;
  return FEATURE_FLAG_DEFAULTS[flag];
}

export function getFeatureFlags(
  env: Record<string, string | undefined> = process.env,
): Record<FeatureFlag, boolean> {
  return Object.fromEntries(
    (Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlag[]).map((f) => [
      f,
      isFeatureEnabled(f, env),
    ]),
  ) as Record<FeatureFlag, boolean>;
}
