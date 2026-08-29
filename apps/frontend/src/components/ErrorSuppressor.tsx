"use client";

import { useEffect } from "react";

/**
 * Known-noisy messages from wallet / state-management libraries that are
 * safe to suppress in the browser console.  Each entry is the *exact* string
 * (or the narrowest reliable prefix) from the upstream bug, together with a
 * reference so we know when it is safe to remove the suppression rule.
 *
 * Rules:
 *  - Match on the exact message text, NOT on a bare library-name substring.
 *  - A real error whose message merely contains the word "reown", "valtio",
 *    etc. must still reach the console (and Sentry — see sentry.client.config.ts).
 *  - When an upstream issue is fixed, remove the corresponding entry here.
 */
const SUPPRESSED_CONSOLE_PATTERNS: ReadonlyArray<{
  /** Exact string to match (compared with ===) or narrow prefix (startsWith). */
  match: (msg: string) => boolean;
  /** Upstream issue / library version that introduced the noise. */
  ref: string;
}> = [
  {
    // WalletConnect / Reown: session request is cancelled when the user closes
    // the modal without connecting.
    // https://github.com/WalletConnect/walletconnect-monorepo/issues/4326
    match: (msg) => msg === "Connection request reset. Please try again.",
    ref: "WalletConnect #4326 — Connection request reset",
  },
  {
    // Reown AppKit logs its own package name on initialisation in some builds.
    // Only suppress the *exact* initialisation line, not any real errors.
    // https://github.com/reown-com/appkit/issues/2788
    match: (msg) =>
      msg.startsWith("[Reown] AppKit initialized") ||
      msg.startsWith("[reown/appkit]"),
    ref: "Reown AppKit #2788 — noisy init log",
  },
  {
    // valtio warns about reading a non-reactive property during SSR hydration.
    // https://github.com/pmndrs/valtio/issues/327
    match: (msg) =>
      msg ===
      "valtio: proxy is not reactive during SSR/hydration. use useSnapshot instead.",
    ref: "valtio #327 — SSR proxy warning",
  },
  {
    // @walletconnect/ethereum-provider logs a benign "No matching key" warning
    // when a previously-cached session key is no longer present.
    // https://github.com/WalletConnect/walletconnect-monorepo/issues/3901
    match: (msg) =>
      msg.startsWith(
        "No matching key. session_delete is a no-op for topic:",
      ) ||
      msg.startsWith(
        "No matching key. session_expire is a no-op for topic:",
      ),
    ref: "WalletConnect ethereum-provider #3901 — no-op session delete/expire",
  },
];

/**
 * Known-noisy unhandled-rejection reasons (Promise rejections).
 */
const SUPPRESSED_REJECTION_PATTERNS: ReadonlyArray<{
  match: (reason: unknown) => boolean;
  ref: string;
}> = [
  {
    // WalletConnect throws "Connection request reset" as an unhandled rejection
    // when the user dismisses the modal.
    match: (reason) =>
      reason instanceof Error &&
      reason.message === "Connection request reset. Please try again.",
    ref: "WalletConnect #4326 — Connection request reset (rejection)",
  },
];

export default function ErrorSuppressor() {
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;

    const shouldSuppress = (args: unknown[]): boolean => {
      const message = args.map(String).join(" ");
      return SUPPRESSED_CONSOLE_PATTERNS.some((rule) => rule.match(message));
    };

    console.error = (...args: unknown[]) => {
      if (shouldSuppress(args)) return;
      originalError.apply(console, args);
    };

    console.warn = (...args: unknown[]) => {
      if (shouldSuppress(args)) return;
      originalWarn.apply(console, args);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (
        SUPPRESSED_REJECTION_PATTERNS.some((rule) =>
          rule.match(event.reason),
        )
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    // Restore originals on unmount so the patch does not outlive the
    // component that installed it.
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, []);

  return null;
}

/**
 * Legacy export alias — kept for backwards compatibility while callers are
 * updated to use the more descriptive `WalletNoiseFilter` name.
 *
 * @deprecated Use `WalletNoiseFilter` instead.
 */
export { WalletNoiseFilter as ErrorSuppressor };

/** Named export for direct use. */
export { WalletNoiseFilter };
