/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  // Type-check test files only. Several source modules carry pre-existing type
  // errors (e.g. pino calls passing a message before the fields object) that
  // would otherwise stop any suite importing them from running. `yarn typecheck`
  // still reports those errors for source files.
  transform: {
    "^.+\\.ts$": ["ts-jest", { diagnostics: { exclude: ["**/*.ts", "!**/*.test.ts"] } }],
  },
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  // Backend tests are written in Jest syntax and named `*.test.ts`.
  testMatch: ["**/*.test.ts"],
  clearMocks: true,
  // Inject required env vars BEFORE any module is loaded (env.ts validates at import time)
  setupFiles: ["<rootDir>/jest.setup.ts"],
};
