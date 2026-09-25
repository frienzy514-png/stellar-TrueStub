"use client"; // make sure this is a client component

/**
 * tw-blocks entry point for the Trustless Work SDK config provider.
 *
 * SDK configuration (base URL + API key) is resolved in exactly one place:
 * `@/lib/trustless-work/config`. This file re-exports that provider so the
 * tw-blocks import path keeps working without a second, independent copy of
 * the config logic. See ./README.md for the full provider stack.
 */
export { TrustlessWorkProvider } from "@/lib/trustless-work/provider";
