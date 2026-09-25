import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    supportFile: "cypress/support/e2e.ts",
    specPattern: "cypress/e2e/**/*.cy.ts",
    fixturesFolder: "cypress/fixtures",
    video: false,
    screenshotOnRunFailure: true,
    // A CI run against a cold Next.js dev server can be slow on the very
    // first request per route (on-demand compilation); a generous default
    // command timeout absorbs that without needing per-test overrides.
    defaultCommandTimeout: 10000,
    retries: {
      runMode: 2,
      openMode: 0,
    },
  },
});
