/**
 * Axios instance for direct Trustless Work API calls.
 *
 * baseURL and the bearer token are read from environment variables so this
 * client can target the correct network (testnet / mainnet) at runtime.
 *
 * Environment variables (see apps/frontend/.env.example):
 *   NEXT_PUBLIC_TRUSTLESS_API_URL      — mainnet API base URL
 *   NEXT_PUBLIC_TRUSTLESS_API_URL_DEV  — testnet/dev API base URL
 *   NEXT_PUBLIC_API_KEY                — Trustless Work bearer token
 *
 * URL resolution matches the pattern used in
 *   src/components/tw-blocks/providers/TrustlessWork.tsx:
 *   use the dev URL when NODE_ENV === "development", production URL otherwise.
 *
 * Fix for issue #124: no hardcoded URLs or literal placeholder tokens.
 */
import axios from "axios";

const isDev = process.env.NODE_ENV === "development";

const baseURL = isDev
  ? (process.env.NEXT_PUBLIC_TRUSTLESS_API_URL_DEV ?? "https://dev.api.trustlesswork.com")
  : (process.env.NEXT_PUBLIC_TRUSTLESS_API_URL ?? "https://api.trustlesswork.com");

const apiKey = process.env.NEXT_PUBLIC_API_KEY ?? "";

if (!apiKey && typeof window === "undefined") {
  // Warn at build/server startup so misconfiguration is caught early.
  // Only fires server-side to avoid leaking the check into client bundles.
  console.warn(
    "[http.ts] NEXT_PUBLIC_API_KEY is not set. Requests to the Trustless Work API will fail auth.",
  );
}

const http = axios.create({
  baseURL,
  timeout: 60000, // 1 minute
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
});

export default http;
