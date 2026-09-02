/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.jest.test.ts"],
  clearMocks: true,
  // Inject required env vars BEFORE any module is loaded (env.ts validates at import time)
  setupFiles: ["<rootDir>/jest.setup.ts"],
};
