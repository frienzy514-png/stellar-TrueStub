// Custom Cypress commands for TrueStub e2e specs.
// See docs/GIT_GUIDELINE.md / apps/frontend/README.md for repo conventions.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Blocks every request to the Trustless Work API (both
       * NEXT_PUBLIC_TRUSTLESS_API_URL and its _DEV counterpart — see
       * apps/frontend/src/components/tw-blocks/providers/TrustlessWork.tsx
       * and apps/frontend/README.md's env var docs) with a 503, so a spec
       * that reaches an escrow-creation network call fails loudly instead
       * of silently hitting real hosted infrastructure from CI.
       *
       * This intentionally does not *mock a successful* escrow response:
       * as of issue #117, the escrow-creation form's "connected wallet"
       * state is gated by an in-memory (non-persisted) Zustand store (see
       * apps/frontend/src/core/store/data/slices/authentication.slice.ts)
       * driven by the real Stellar Wallet Kit connect modal — there is no
       * existing seam (e.g. a persisted localStorage key) this spec can
       * seed to reach that state without actually driving the modal. Full
       * wallet-signing mocking is a natural follow-up once such a seam
       * exists; see the spec file for the exact boundary this covers today.
       */
      blockTrustlessWorkApi(): Chainable<null>;
    }
  }
}

Cypress.Commands.add("blockTrustlessWorkApi", () => {
  return cy.intercept(
    { url: "**://*.trustlesswork.com/**" },
    { statusCode: 503, body: { error: "blocked in e2e — see blockTrustlessWorkApi" } }
  ) as unknown as Cypress.Chainable<null>;
});

export {};
