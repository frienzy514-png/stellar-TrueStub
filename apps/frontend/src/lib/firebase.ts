import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth } from "firebase/auth";

// firebase.ts
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  throw new Error(`Missing Firebase config: ${missing.join(", ")}`);
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Bot protection (#193). Firebase App Check attaches an attestation token to
// Firebase Auth requests (sign-in, sign-up); once enforcement is enabled in
// the Firebase console, requests from scripts/bots without a valid token are
// rejected. reCAPTCHA v3 is invisible, so real users see no extra friction.
// Must run before getAuth() makes its first request, and only in the browser.
if (typeof window !== "undefined") {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (siteKey) {
    if (process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN) {
      (
        self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }
      ).FIREBASE_APPCHECK_DEBUG_TOKEN =
        process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
    }
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // Already initialized (HMR / multiple imports) — safe to ignore.
    }
  } else if (process.env.NODE_ENV === "production") {
    console.warn(
      "NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not set — Firebase App Check is disabled.",
    );
  }
}

export const auth = getAuth(app);