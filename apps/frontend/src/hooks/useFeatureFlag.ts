"use client";

import { useEffect, useState } from "react";
import { FEATURE_FLAG_DEFAULTS, type FeatureFlag } from "@/lib/featureFlags";

/** Client-side flag lookup; starts at the flag's default until the fetch resolves. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  const [enabled, setEnabled] = useState<boolean>(FEATURE_FLAG_DEFAULTS[flag]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/feature-flags")
      .then((r) => (r.ok ? r.json() : null))
      .then((flags) => {
        if (!cancelled && flags && typeof flags[flag] === "boolean") {
          setEnabled(flags[flag]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [flag]);

  return enabled;
}
