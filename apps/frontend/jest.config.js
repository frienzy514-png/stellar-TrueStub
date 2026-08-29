const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: [],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Baseline thresholds matching current actual coverage (2 test files today).
  // Ratchet these up incrementally as more tests are added — never lower them.
  coverageThreshold: {
    global: {
      lines: 1,
      functions: 1,
      branches: 1,
      statements: 1,
    },
  },
};

module.exports = createJestConfig(customJestConfig);
