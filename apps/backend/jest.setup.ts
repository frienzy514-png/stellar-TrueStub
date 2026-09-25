/**
 * Jest environment setup for apps/backend — runs before any test module loads.
 *
 * The backend's config/env.ts validates required environment variables at
 * module-load time (including Firebase credentials). Without this setup file,
 * every test suite that imports *any* backend module fails immediately with
 * "Invalid environment variables".
 *
 * We set minimal valid stub values here so the schema passes validation. Real
 * Firebase initialisation (firebase-admin) is NOT performed by these stubs —
 * tests that exercise Firebase-dependent code must mock firebase-admin directly.
 */

process.env.NODE_ENV = "test";
process.env.PORT = "4000";

// Firebase Admin SDK stubs — satisfy Zod validation without calling Firebase
process.env.FIREBASE_ADMIN_PROJECT_ID = "test-project";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "test@test-project.iam.gserviceaccount.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAtest\n-----END RSA PRIVATE KEY-----\n";
