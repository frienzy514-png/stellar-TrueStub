#!/usr/bin/env node
/**
 * check-in-memory-stores.mjs
 *
 * Flags newly added in-memory store instances (`new Map<...>` / `new Map(...)`
 * / `new Set<...>` / `new Set(...)`) in backend service files. Such stores
 * lose their data on restart and are not shared across instances, so a
 * reviewer should confirm the choice is deliberate (see CONTRIBUTING.md,
 * "Review checklist: in-memory state in services").
 *
 * Only lines ADDED by the diff are inspected, so pre-existing stores do not
 * re-trigger the warning on every PR.
 *
 * Usage:
 *   node scripts/check-in-memory-stores.mjs [--base <ref>]
 *
 *   --base <ref>   Base ref to diff against (default: origin/main).
 *
 * Exit code is always 0: this check is advisory and never blocks a merge.
 * Findings are printed as a Markdown report on stdout. When GITHUB_OUTPUT is
 * set, the script also writes `finding_count=<n>` and `report=<markdown>`.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

export const SERVICES_PATH = "apps/backend/src/services/";
const STORE_RE = /\bnew (?:Map|Set)\s*(?:<[^>]*>)?\s*\(/;

/**
 * Parses unified diff output (zero context) and returns the added lines that
 * create an in-memory store, as `{ file, line, text }` records.
 */
export function findInMemoryStores(diffText) {
  const findings = [];
  let file = null;
  let newLine = 0;

  for (const raw of diffText.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const target = raw.slice(4).replace(/^b\//, "");
      file = target === "/dev/null" ? null : target;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      if (file && isServiceSource(file) && STORE_RE.test(raw)) {
        findings.push({ file, line: newLine, text: raw.slice(1).trim() });
      }
      newLine += 1;
    }
  }
  return findings;
}

export function isServiceSource(file) {
  return file.startsWith(SERVICES_PATH) && file.endsWith(".ts") && !file.endsWith(".test.ts");
}

export function buildReport(findings) {
  const rows = findings.map((f) => `- \`${f.file}:${f.line}\` — \`${f.text}\``).join("\n");
  return [
    "<!-- in-memory-store-check -->",
    "### ⚠️ New in-memory store in a backend service",
    "",
    "This PR adds an in-memory `Map`/`Set` inside `apps/backend/src/services/`. Data kept",
    "this way is lost on restart and is not shared across instances.",
    "",
    rows,
    "",
    "Reviewers: if this state must survive a restart or be shared, use a persistent store.",
    "Otherwise, confirm the in-memory choice is deliberate. This check is advisory only.",
  ].join("\n");
}

function main() {
  const baseIdx = process.argv.indexOf("--base");
  const base = baseIdx !== -1 ? process.argv[baseIdx + 1] : "origin/main";

  const diff = execFileSync("git", ["diff", "--unified=0", `${base}...HEAD`, "--", SERVICES_PATH], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  const findings = findInMemoryStores(diff);
  const report = findings.length > 0 ? buildReport(findings) : "";

  if (findings.length > 0) {
    console.log(report);
  } else {
    console.log("No newly added in-memory stores in backend services.");
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `finding_count=${findings.length}\nreport<<EOF_REPORT\n${report}\nEOF_REPORT\n`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
