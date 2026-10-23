#!/usr/bin/env node
/**
 * check-wiring-status-paths.mjs
 *
 * CI gate for docs/GRAPHQL_WIRING_STATUS.md (#366). That doc is only useful
 * if the files it points at exist, so this fails when one doesn't.
 *
 * Usage:
 *
 *   node scripts/check-wiring-status-paths.mjs [file.md]
 *
 * (default file: docs/GRAPHQL_WIRING_STATUS.md, relative to the repo root)
 *
 * What gets checked:
 *   1. The first backtick-quoted value in the first column of every table
 *      row. These must be full paths from the repo root and must exist.
 *   2. Any other backtick-quoted value that starts with a top-level repo
 *      directory (`apps/`, `docs/`, `scripts/`, `.github/`, ...). Must exist.
 *   3. Relative markdown links, e.g. [CONTRIBUTING.md](../CONTRIBUTING.md).
 *
 * Exit codes: 0 = all paths exist, 1 = at least one is missing.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, join, resolve, relative } from "path";
import { fileURLToPath } from "url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docArg = process.argv[2] ?? "docs/GRAPHQL_WIRING_STATUS.md";
const docPath = resolve(repoRoot, docArg);
const docRel = relative(repoRoot, docPath);

if (!existsSync(docPath)) {
  console.error(`::error::${docRel} not found`);
  process.exit(1);
}

const topLevelDirs = new Set(
  readdirSync(repoRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== ".git" && e.name !== "node_modules")
    .map((e) => e.name),
);

const lines = readFileSync(docPath, "utf8").split("\n");
const problems = [];
let inCodeFence = false;

const pathExists = (p) => existsSync(join(repoRoot, p.replace(/\/$/, "")));

lines.forEach((line, i) => {
  const lineNo = i + 1;
  if (/^\s*(```|~~~)/.test(line)) {
    inCodeFence = !inCodeFence;
    return;
  }
  if (inCodeFence) return;

  const isTableRow = /^\s*\|/.test(line) && !/^\s*\|[\s|:-]+\|\s*$/.test(line);
  const checked = new Set();

  // 1. First column of table rows.
  if (isTableRow) {
    const firstCell = line.trim().replace(/^\|/, "").split("|")[0];
    const first = firstCell.match(/`([^`]+)`/);
    if (first) {
      const value = first[1].trim();
      checked.add(value);
      if (!topLevelDirs.has(value.split("/")[0])) {
        problems.push({
          lineNo,
          msg: `\`${value}\` is not a full path from the repo root (expected it to start with one of: ${[...topLevelDirs].sort().join(", ")})`,
        });
      } else if (!pathExists(value)) {
        problems.push({ lineNo, msg: `\`${value}\` does not exist` });
      }
    }
  }

  // 2. Any backtick value that looks like a repo-root path.
  for (const m of line.matchAll(/`([^`\s]+)`/g)) {
    const value = m[1];
    if (checked.has(value) || !value.includes("/")) continue;
    if (!topLevelDirs.has(value.split("/")[0])) continue;
    checked.add(value);
    if (!pathExists(value)) {
      problems.push({ lineNo, msg: `\`${value}\` does not exist` });
    }
  }

  // 3. Relative markdown links.
  for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1].split("#")[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    const abs = resolve(dirname(docPath), target);
    if (!existsSync(abs)) {
      problems.push({ lineNo, msg: `link target \`${target}\` does not exist` });
    }
  }
});

if (problems.length) {
  for (const p of problems) {
    console.error(`::error file=${docRel},line=${p.lineNo}::${p.msg}`);
  }
  console.error(`\n${problems.length} broken path(s) in ${docRel}.`);
  process.exit(1);
}

console.log(`All paths in ${docRel} exist.`);
