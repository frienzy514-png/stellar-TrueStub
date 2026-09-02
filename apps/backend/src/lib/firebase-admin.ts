import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "../config/env";

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        // Service-account keys are usually stored in env files with literal
        // "\n" sequences instead of real newlines — un-escape them here.
        privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });

export const firebaseAuth = getAuth(app);
