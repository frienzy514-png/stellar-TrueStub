"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

/**
 * The signed-in Firebase user's UID — the same value Hasura sees as
 * X-Hasura-User-Id. `undefined` while auth is resolving, `null` when signed out.
 */
export function useCurrentUserId(): string | null | undefined {
  const [userId, setUserId] = useState<string | null | undefined>(
    auth.currentUser?.uid,
  );

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => setUserId(user?.uid ?? null));
  }, []);

  return userId;
}
