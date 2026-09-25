/**
 * Escrow lifecycle (issue #117).
 *
 * ## Scope of this spec, and why
 *
 * The issue asks for a spec covering: create listing -> create escrow ->
 * buyer funds it (mocked wallet signing) -> transfer confirmed -> funds
 * release -> dashboard shows `completed`.
 *
 * Investigating the current codebase to write this spec found that flow
 * isn't a single connected UI journey yet:
 *
 * - `/dashboard/escrow` (the escrow list) renders hardcoded `STUB_ESCROWS`,
 *   and its "New Escrow" button is an unwired `console.log` TODO — it does
 *   not lead anywhere real yet.
 * - The one entrypoint that *is* real —
 *   `/dashboard/event/create-escrow` -> `TicketEscrowWrapper` ->
 *   `EscrowCreationForm` — gates its actual creation form behind a
 *   connected-wallet check driven by an **in-memory, non-persisted**
 *   Zustand store (`useGlobalAuthenticationStore`, see
 *   `src/core/store/data/slices/authentication.slice.ts`) that's only ever
 *   set by really driving the Stellar Wallet Kit's connect modal. There is
 *   no existing seam (e.g. a persisted localStorage key, a test-only
 *   store setter) this spec can seed to reach the "wallet connected" state
 *   without depending on real wallet-kit internals — which is exactly the
 *   real testnet/live infrastructure issue #117 asks specs to avoid.
 * - Fund/confirm-transfer/release for an *existing* escrow live in a
 *   further, separately-reachable component
 *   (`src/components/escrow/WalletEscrowDashboard.tsx` and the
 *   `tw-blocks/escrows/*` action components) that isn't linked from the
 *   creation flow above.
 *
 * So rather than writing a spec that *looks* like it exercises the full
 * lifecycle but actually can't (because the wallet-connected state can't be
 * reached), this spec covers exactly what's genuinely testable today:
 * reaching the escrow-creation entrypoint, and the (real, current) gate in
 * front of it. Extending this to the connected-wallet creation form and
 * beyond is a natural follow-up once either (a) the app exposes a
 * test-only way to seed the auth store, or (b) the wallet-kit connect flow
 * itself gets a documented mocking seam.
 */

describe("Escrow lifecycle: creation entrypoint", () => {
  beforeEach(() => {
    // Never let a spec run against real hosted infrastructure in CI.
    cy.blockTrustlessWorkApi();
  });

  it("walks from the purchase-ID entry form to the wallet-connection gate", () => {
    cy.visit("/dashboard/event/create-escrow");

    cy.contains("h1, h2, h3, [class*='CardTitle']", "Create Escrow for Purchase").should(
      "be.visible"
    );

    cy.get("#purchaseId")
      .should("be.visible")
      .type("purchase-e2e-001");

    cy.contains("button", "Continue to Escrow Creation").click();

    // The wrapper loads simulated purchase/event data (see
    // TicketEscrowWrapper.tsx's getTicketPurchase/getEvent — themselves
    // still TODO-marked stubs, not a real API call) before showing the
    // creation form, so allow a moment for that loading step to resolve.
    cy.contains("Create Escrow", { timeout: 10000 }).should("be.visible");

    // With no wallet connected, EscrowCreationForm must show the
    // wallet-connection prompt rather than the real Trustless Work
    // initialize-escrow form — this is the actual current gate, and the
    // most meaningful thing this spec can assert without a wallet-mocking
    // seam (see the module doc comment above).
    cy.contains("Connect Your Wallet").should("be.visible");
    cy.contains("button", "Connect Wallet").should("be.visible");
  });

  it("shows a validation-friendly state and does not proceed with an empty purchase ID", () => {
    cy.visit("/dashboard/event/create-escrow");

    // The purchase ID input is `required`; submitting empty must not
    // advance past the entry form.
    cy.contains("button", "Continue to Escrow Creation").click();
    cy.contains("Create Escrow for Purchase").should("be.visible");
    cy.contains("Connect Your Wallet").should("not.exist");
  });
});
