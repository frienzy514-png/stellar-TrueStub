// See docs/GIT_GUIDELINE.md for the full convention this enforces:
// `<type>: <short description>`, lowercase, under 72 characters.

/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 72],
    "subject-case": [2, "always", "lower-case"],
    "type-case": [2, "always", "lower-case"],
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "change", "chore", "remove"],
    ],
  },
};
