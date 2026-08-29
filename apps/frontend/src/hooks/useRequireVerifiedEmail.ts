"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export type EmailVerificationStatus = "checking" | "verified" | "blocked";

/**
 * Gates access to a route/component behind Firebase's `emailVerified` flag.
 * Signed-out visitors are left alone (no auth session to gate at all here) —
 * this only redirects a *signed-in-but-unverified* user away from escrow
 * creation and back to the verification flow.
 */
export function useRequireVerifiedEmail(): EmailVerificationStatus {
  const router = useRouter();
  const [status, setStatus] = useState<EmailVerificationStatus>("checking");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !user.emailVerified) {
        setStatus("blocked");
        router.replace("/verify-email");
        return;
      }

      setStatus("verified");
    });

    return unsubscribe;
  }, [router]);

  return status;
}
