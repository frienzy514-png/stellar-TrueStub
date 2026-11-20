/** The `e2e=1` route is an explicit test-only wallet/API seam. */
describe("Escrow lifecycle", () => {
  beforeEach(() => {
    cy.mockEscrowLifecycleApi();
  });

  it("creates, funds, confirms transfer, releases, and reaches completed", () => {
    cy.visit("/dashboard/event/create-escrow?e2e=1");
    cy.contains("Status: ready").should("be.visible");
    cy.contains("Create Escrow").click();
    cy.wait("@escrowcreate");
    cy.contains("Status: created").should("be.visible");
    cy.contains("Fund Escrow").click();
    cy.wait("@escrowfund");
    cy.contains("Status: funded").should("be.visible");
    cy.contains("Confirm Transfer").click();
    cy.wait("@escrowtransfer");
    cy.contains("Status: transfer_confirmed").should("be.visible");
    cy.contains("Release Funds").click();
    cy.wait("@escrowrelease");
    cy.contains("Status: completed").should("be.visible");
    cy.contains("Escrow completed").should("be.visible");
  });
});
