/**
 * Escrow lifecycle E2E spec (issues #117, #502).
 *
 * Covers both:
 * 1. The disconnected-wallet gate on `/dashboard/event/create-escrow`.
 * 2. The full connected-wallet escrow lifecycle journey using the documented
 *    wallet auth/signing seam (`cy.seedConnectedWallet`) and mocked Trustless
 *    Work API intercepts (`cy.mockTrustlessWorkLifecycle`):
 *      create escrow -> buyer funds escrow -> confirm ticket transfer ->
 *      release funds -> verify `Completed` status on `/dashboard/escrow`.
 * 3. Error-surface verification when a lifecycle step fails so regressions in
 *    any step fail loudly.
 */

const E2E_CONTRACT_ID =
  "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

describe("Escrow lifecycle: disconnected wallet gate", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.blockTrustlessWorkApi();
  });

  it("walks from the purchase-ID entry form to the wallet-connection gate", () => {
    cy.visit("/dashboard/event/create-escrow");

    cy.contains(
      "h1, h2, h3, [class*='CardTitle']",
      "Create Escrow for Purchase"
    ).should("be.visible");

    cy.get("#purchaseId").should("be.visible").type("purchase-e2e-001");

    cy.contains("button", "Continue to Escrow Creation").click();

    cy.contains("Create Escrow", { timeout: 10000 }).should("be.visible");
    cy.contains("Connect Your Wallet").should("be.visible");
    cy.contains("button", "Connect Wallet").should("be.visible");
  });

  it("shows a validation-friendly state and does not proceed with an empty purchase ID", () => {
    cy.visit("/dashboard/event/create-escrow");

    cy.contains("button", "Continue to Escrow Creation").click();
    cy.contains("Create Escrow for Purchase").should("be.visible");
    cy.contains("Connect Your Wallet").should("not.exist");
  });
});

describe("Escrow lifecycle: connected wallet end-to-end journey", () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it("completes create -> fund -> confirm transfer -> release -> completed status on dashboard", () => {
    cy.blockTrustlessWorkApi();
    cy.mockTrustlessWorkLifecycle({ contractId: E2E_CONTRACT_ID });

    cy.visit("/dashboard/event/create-escrow");
    cy.seedConnectedWallet();

    // 1. Enter purchase ID and open the connected-wallet escrow creation form
    cy.get("#purchaseId").should("be.visible").type("purchase-e2e-full-001");
    cy.contains("button", "Continue to Escrow Creation").click();

    cy.contains("Secure Your Escrow Payment", { timeout: 10000 }).should(
      "be.visible"
    );
    cy.contains("Connect Your Wallet").should("not.exist");

    // 2. Open the Trustless Work configuration form, autofill, and deploy
    cy.contains("button", /Proceed to Create Escrow/i).click();
    cy.contains("Escrow Configuration").should("be.visible");

    cy.contains("button", "Autofill").click();
    cy.contains("button", "Deploy").click();

    cy.wait("@twDeploy")
      .its("request.body")
      .should("include", { engagementId: "ENG-001" });
    cy.wait("@twSendTransaction")
      .its("request.body.signedXdr")
      .should("include", "MOCK_SIGNED_XDR:UNSIGNED_DEPLOY_XDR");

    // 3. Verify confirmation view & initial Pending Funding lifecycle state
    cy.contains("Escrow Created Successfully!", { timeout: 10000 }).should(
      "be.visible"
    );
    cy.get("[data-testid='escrow-lifecycle-status']").should(
      "contain.text",
      "Pending Funding"
    );

    // 4. Fund the escrow (buyer funds via mocked wallet signing)
    cy.get("[data-testid='lifecycle-fund-btn']")
      .should("not.be.disabled")
      .click();
    cy.wait("@twFund")
      .its("request.body")
      .should("include", { contractId: E2E_CONTRACT_ID, amount: 450 });
    cy.wait("@twSendTransaction")
      .its("request.body.signedXdr")
      .should("include", "MOCK_SIGNED_XDR:UNSIGNED_FUND_XDR");
    cy.get("[data-testid='escrow-lifecycle-status']").should(
      "contain.text",
      "Funded"
    );

    // 5. Confirm ticket transfer
    cy.get("[data-testid='lifecycle-confirm-transfer-btn']")
      .should("not.be.disabled")
      .click();
    cy.wait("@twConfirmTransfer")
      .its("request.body")
      .should("include", { contractId: E2E_CONTRACT_ID, milestoneIndex: "0" });
    cy.wait("@twSendTransaction")
      .its("request.body.signedXdr")
      .should("include", "MOCK_SIGNED_XDR:UNSIGNED_APPROVE_XDR");
    cy.get("[data-testid='escrow-lifecycle-status']").should(
      "contain.text",
      "Transfer Confirmed"
    );

    // 6. Release escrow funds
    cy.get("[data-testid='lifecycle-release-funds-btn']")
      .should("not.be.disabled")
      .click();
    cy.wait("@twReleaseFunds")
      .its("request.body")
      .should("include", { contractId: E2E_CONTRACT_ID, milestoneIndex: "0" });
    cy.wait("@twSendTransaction")
      .its("request.body.signedXdr")
      .should("include", "MOCK_SIGNED_XDR:UNSIGNED_RELEASE_XDR");
    cy.get("[data-testid='escrow-lifecycle-status']").should(
      "contain.text",
      "Completed"
    );

    // 7. Navigate to the escrow dashboard and verify the escrow shows Completed
    cy.contains("button", "Go to Dashboard").click();
    cy.location("pathname", { timeout: 10000 }).should(
      "eq",
      "/dashboard/escrow"
    );

    cy.get(`[data-testid='escrow-row-${E2E_CONTRACT_ID}']`)
      .should("be.visible")
      .within(() => {
        cy.contains("Grand Stellar Event").should("be.visible");
        cy.contains("$450.00").should("be.visible");
        cy.contains(/Completed/i).should("be.visible");
      });

    // Filtering by the Completed tab still displays the completed escrow
    cy.contains("button", "Completed").click();
    cy.get(`[data-testid='escrow-row-${E2E_CONTRACT_ID}']`).should(
      "be.visible"
    );
  });

  it("surfaces a lifecycle error and blocks progression when a lifecycle step fails", () => {
    cy.blockTrustlessWorkApi();
    cy.mockTrustlessWorkLifecycle({
      contractId: E2E_CONTRACT_ID,
      failStep: "fund",
    });

    cy.visit("/dashboard/event/create-escrow");
    cy.seedConnectedWallet();

    cy.get("#purchaseId").should("be.visible").type("purchase-e2e-fail-001");
    cy.contains("button", "Continue to Escrow Creation").click();

    cy.contains("button", /Proceed to Create Escrow/i, {
      timeout: 10000,
    }).click();
    cy.contains("button", "Autofill").click();
    cy.contains("button", "Deploy").click();

    cy.contains("Escrow Created Successfully!", { timeout: 10000 }).should(
      "be.visible"
    );

    // Attempting to fund when the Trustless Work fund-escrow endpoint fails
    // must surface an alert and keep status at Pending Funding.
    cy.get("[data-testid='lifecycle-fund-btn']").click();
    cy.wait("@twFund");

    cy.get("[data-testid='escrow-lifecycle-error']")
      .should("be.visible")
      .and("have.attr", "role", "alert");
    cy.get("[data-testid='escrow-lifecycle-status']").should(
      "contain.text",
      "Pending Funding"
    );
    cy.get("[data-testid='lifecycle-confirm-transfer-btn']").should(
      "be.disabled"
    );
  });
});
