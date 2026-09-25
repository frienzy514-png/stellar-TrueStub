/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  // Backend tests are written in Jest syntax and named `*.test.ts`.
  testMatch: ["**/*.test.ts"],
  clearMocks: true,
  // Inject required env vars BEFORE any module is loaded (env.ts validates at import time)
  setupFiles: ["<rootDir>/jest.setup.ts"],
};
