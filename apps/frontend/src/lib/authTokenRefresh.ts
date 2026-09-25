import { onIdTokenChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Firebase ID tokens expire after ~1 hour. Apollo's auth link already pulls
 * a fresh token before every request, but a session with no GraphQL traffic
 * for a while (idle tab, long read) would otherwise carry a stale token
 * until the next request triggers a refresh. This schedules an explicit
 * `getIdToken(true)` shortly before each token's expiry so the session
 * stays valid without requiring user activity or a manual re-login.
 */
export function startAuthTokenRefresh(): () => void {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };

  const scheduleRefresh = async (user: User) => {
    try {
      const { expirationTime } = await user.getIdTokenResult();
      const msUntilExpiry = new Date(expirationTime).getTime() - Date.now();
      const delay = Math.max(msUntilExpiry - REFRESH_MARGIN_MS, 0);

      clearTimer();
      refreshTimer = setTimeout(() => {
        user.getIdToken(true).catch((error) => {
          console.error("Failed to proactively refresh Firebase ID token:", error);
        });
      }, delay);
    } catch (error) {
      console.error("Failed to schedule Firebase ID token refresh:", error);
    }
  };

  const unsubscribe = onIdTokenChanged(auth, (user) => {
    clearTimer();
    if (user) {
      scheduleRefresh(user);
    }
  });

  return () => {
    clearTimer();
    unsubscribe();
  };
}
