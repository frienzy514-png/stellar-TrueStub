import fs from "fs";
import path from "path";

// Guards the CODEOWNERS rules that enforce required maintainer review.
// Branch protection ("Require review from Code Owners" + no self-approval)
// lives in GitHub settings and cannot be read from the repo, so this test
// checks the repo side: every required-review path has an owner, and the
// owner is the same sole maintainer the rule file documents.

const CODEOWNERS_PATH = path.resolve(__dirname, "../../../.github/CODEOWNERS");
const SOLE_MAINTAINER = "@frienzy514-png";

type Rule = { pattern: string; owners: string[] };

function parseCodeowners(source: string): Rule[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      return { pattern, owners };
    });
}

const rules = parseCodeowners(fs.readFileSync(CODEOWNERS_PATH, "utf8"));

// Returns the owners of the last rule matching `pattern` exactly, which is
// how CODEOWNERS resolves precedence (later rules win).
function ownersFor(pattern: string): string[] | undefined {
  const matches = rules.filter((r) => r.pattern === pattern);
  return matches.length ? matches[matches.length - 1].owners : undefined;
}

describe("CODEOWNERS required-review enforcement", () => {
  it("has a catch-all default owner", () => {
    expect(ownersFor("*")).toEqual([SOLE_MAINTAINER]);
  });

  it.each([
    "/contracts/",
    "/apps/backend/src/db/migrations/",
    "/.github/workflows/",
    "/package.json",
    "/yarn.lock",
    "/apps/backend/Dockerfile",
  ])("requires review from the maintainer for %s", (pattern) => {
    expect(ownersFor(pattern)).toEqual([SOLE_MAINTAINER]);
  });

  it("names only the sole maintainer as owner (no unassigned owners)", () => {
    for (const rule of rules) {
      expect(rule.owners.length).toBeGreaterThan(0);
      for (const owner of rule.owners) {
        expect(owner).toBe(SOLE_MAINTAINER);
      }
    }
  });

  it("keeps the branch-protection instructions in the rule file", () => {
    const source = fs.readFileSync(CODEOWNERS_PATH, "utf8");
    expect(source).toContain("Require review from Code Owners");
    expect(source).toContain("Require a pull request before merging");
  });
});
