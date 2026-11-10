// Custom Cypress commands for TrueStub e2e specs.
// See docs/GIT_GUIDELINE.md / apps/frontend/README.md for repo conventions.

export interface SeedConnectedWalletOptions {
  address?: string;
  name?: string;
  signedXdrPrefix?: string;
}

export interface MockTrustlessWorkLifecycleOptions {
  contractId?: string;
  failStep?: "deploy" | "fund" | "confirm" | "release";
}

const DEFAULT_E2E_WALLET_ADDRESS =
  "GBCXK3ZQWFWMQJXLSIMVCAHUKTJVWRJPB5XYGZGQCVBWKWVEPTSYLUHI";
const DEFAULT_E2E_CONTRACT_ID =
  "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Blocks every request to the Trustless Work API with a 503 so a spec
       * that reaches an unmocked network call fails loudly instead of hitting
       * live hosted infrastructure in CI.
       */
      blockTrustlessWorkApi(): Chainable<null>;

      /**
       * Seeds a connected Stellar wallet and deterministic transaction-signing
       * seam into browser storage (and any mounted Zustand auth store) so E2E
       * specs can exercise wallet-gated escrow flows without driving a live
       * browser wallet extension.
       */
      seedConnectedWallet(options?: SeedConnectedWalletOptions): Chainable<null>;

      /**
       * Intercepts the Trustless Work escrow lifecycle endpoints (deploy,
       * fund-escrow, approve-milestone, release-milestone-funds / release-funds,
       * and helper/send-transaction) with deterministic responses and aliases.
       */
      mockTrustlessWorkLifecycle(
        options?: MockTrustlessWorkLifecycleOptions
      ): Chainable<null>;
    }
  }
}

Cypress.Commands.add("blockTrustlessWorkApi", () => {
  return cy.intercept(
    { url: "**://*.trustlesswork.com/**" },
    { statusCode: 503, body: { error: "blocked in e2e — see blockTrustlessWorkApi" } }
  ) as unknown as Cypress.Chainable<null>;
});

Cypress.Commands.add(
  "seedConnectedWallet",
  (options: SeedConnectedWalletOptions = {}) => {
    const address = options.address ?? DEFAULT_E2E_WALLET_ADDRESS;
    const name = options.name ?? "Freighter";
    const signedXdrPrefix = options.signedXdrPrefix ?? "MOCK_SIGNED_XDR";

    return cy.window({ log: false }).then((win) => {
      win.localStorage.setItem(
        "address-wallet",
        JSON.stringify({ state: { address, name, token: "" } })
      );
      win.localStorage.setItem("walletAddress", address);
      win.localStorage.setItem("walletName", name);
      win.localStorage.setItem("truestub:mockSignedXdr", signedXdrPrefix);

      const authStore = (
        win as unknown as {
          __TRUESTUB_AUTH_STORE__?: {
            getState: () => {
              connectWalletStore: (addr: string, walletName: string) => void;
            };
          };
        }
      ).__TRUESTUB_AUTH_STORE__;

      if (authStore?.getState) {
        authStore.getState().connectWalletStore(address, name);
      }
    }) as unknown as Cypress.Chainable<null>;
  }
);

Cypress.Commands.add(
  "mockTrustlessWorkLifecycle",
  (options: MockTrustlessWorkLifecycleOptions = {}) => {
    const contractId = options.contractId ?? DEFAULT_E2E_CONTRACT_ID;
    const failStep = options.failStep;

    cy.intercept("POST", "**://*.trustlesswork.com/deployer/*", (req) => {
      if (failStep === "deploy") {
        req.reply({
          statusCode: 500,
          body: { message: "Simulated deploy failure" },
        });
        return;
      }
      req.reply({
        statusCode: 200,
        body: {
          status: "SUCCESS",
          unsignedTransaction: "UNSIGNED_DEPLOY_XDR",
        },
      });
    }).as("twDeploy");

    cy.intercept(
      "POST",
      "**://*.trustlesswork.com/escrow/*/fund-escrow",
      (req) => {
        if (failStep === "fund") {
          req.reply({
            statusCode: 500,
            body: { message: "Simulated fund-escrow failure" },
          });
          return;
        }
        req.reply({
          statusCode: 200,
          body: {
            status: "SUCCESS",
            unsignedTransaction: "UNSIGNED_FUND_XDR",
          },
        });
      }
    ).as("twFund");

    cy.intercept(
      "POST",
      "**://*.trustlesswork.com/escrow/*/approve-milestone",
      (req) => {
        if (failStep === "confirm") {
          req.reply({
            statusCode: 500,
            body: { message: "Simulated confirm-transfer failure" },
          });
          return;
        }
        req.reply({
          statusCode: 200,
          body: {
            status: "SUCCESS",
            unsignedTransaction: "UNSIGNED_APPROVE_XDR",
          },
        });
      }
    ).as("twConfirmTransfer");

    cy.intercept(
      "POST",
      "**://*.trustlesswork.com/escrow/*/release*funds",
      (req) => {
        if (failStep === "release") {
          req.reply({
            statusCode: 500,
            body: { message: "Simulated release-funds failure" },
          });
          return;
        }
        req.reply({
          statusCode: 200,
          body: {
            status: "SUCCESS",
            unsignedTransaction: "UNSIGNED_RELEASE_XDR",
          },
        });
      }
    ).as("twReleaseFunds");

    return cy
      .intercept(
        "POST",
        "**://*.trustlesswork.com/helper/send-transaction",
        (req) => {
          req.reply({
            statusCode: 200,
            body: {
              status: "SUCCESS",
              contractId,
            },
          });
        }
      )
      .as("twSendTransaction") as unknown as Cypress.Chainable<null>;
  }
);

export {};
