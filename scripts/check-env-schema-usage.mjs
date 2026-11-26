#!/usr/bin/env node
/**
 * check-env-schema-usage.mjs
 *
 * Cross-checks every `env.SOMETHING` read in the backend against the keys
 * declared in the Zod `envSchema`, which is the sole source of the `Env` type.
 *
 * Why this exists (#526): `lib/hasura.ts` read `env.HASURA_ADMIN_SECRET` while
 * the schema only declared `HASURA_GRAPHQL_ADMIN_SECRET`. The property does not
 * exist on `Env`, so the value was always `undefined` and every Hasura request
 * threw "must be configured" even with a correct environment. A one-character
 * name mismatch in configuration is invisible in review and only shows up as a
 * runtime failure, so it is worth checking mechanically rather than by eye.
 *
 * The check is intentionally narrow:
 *   - It inspects `env.X` reads only. Direct `process.env.X` reads bypass
 *     validation entirely and are reported as advisory notes (they do not fail
 *     the run), because some of them are deliberate CLI/platform variables.
 *   - `process.env.X` is not matched as an `env.X` read, and neither is
 *     `this.env.X` on some unrelated object.
 *
 * Usage:
 *   node scripts/check-env-schema-usage.mjs            # fail on mismatches
 *   node scripts/check-env-schema-usage.mjs --report   # also print a Markdown
 *                                                      # audit table for docs
 *
 * Exit codes: 0 = every `env.X` usage maps to a schema key, 1 = mismatch found
 * (or the schema could not be parsed).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const SCHEMA_PATH = "apps/backend/src/config/env.ts";
export const SRC_PATH = "apps/backend/src";

/** Matches `env.SOME_KEY`, but not `process.env.SOME_KEY` or `x.env.SOME_KEY`. */
const ENV_READ_RE = /(?<![\w$.])env\.([A-Z][A-Z0-9_]*)/g;
const PROCESS_ENV_READ_RE = /process\.env\.([A-Z][A-Z0-9_]*)/g;

/**
 * Extracts the top-level keys of the `envSchema = z.object({ ... })` literal.
 * Keys are declared as two-space-indented `NAME:` properties, which matches
 * every entry in `env.ts` and avoids picking up nested object keys.
 */
export function parseEnvSchemaKeys(source) {
  const start = source.indexOf("envSchema = z.object({");
  if (start === -1) {
    throw new Error(`Could not find \`envSchema = z.object({\` in ${SCHEMA_PATH}`);
  }
  const end = source.indexOf("export type Env", start);
  if (end === -1) {
    throw new Error(`Could not find \`export type Env\` after envSchema in ${SCHEMA_PATH}`);
  }

  const body = source.slice(start, end);
  const keys = [];
  for (const match of body.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)) {
    if (!keys.includes(match[1])) keys.push(match[1]);
  }
  return keys;
}

/**
 * Blanks out comments while preserving offsets and newlines, so a comment that
 * mentions `env.SOMETHING` (for example the explanation of an old bug) is not
 * treated as a real read. Handles line comments and block comments, and skips
 * over string and template literals so `https://` is not mistaken for a
 * comment.
 */
export function stripComments(source) {
  let result = "";
  let quote = null;
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (quote) {
      result += char;
      if (char === "\\") {
        result += next ?? "";
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      result += char;
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        result += " ";
        index += 1;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      result += "  ";
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        result += source[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      if (index < source.length) {
        result += "  ";
        index += 2;
      }
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

/** Recursively lists `.ts` files under `dir` (relative paths). */
export function listTypeScriptFiles(dir = SRC_PATH) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listTypeScriptFiles(path));
    else if (entry.name.endsWith(".ts")) found.push(path);
  }
  return found.sort();
}

/**
 * Scans files for `env.X` reads and `process.env.X` reads.
 * Returns `{ usages, directReads }`, where `usages` maps a key to the list of
 * `{ file, line }` references and `directReads` is the same shape for direct
 * process access.
 */
export function collectEnvUsage(files, root = SRC_PATH) {
  const usages = new Map();
  const directReads = new Map();

  const record = (map, key, location) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(location);
  };

  for (const file of files) {
    const source = stripComments(readFileSync(file, "utf8"));
    source.split("\n").forEach((text, index) => {
      const line = index + 1;
      const location = { file: relative(root, file), line };
      for (const match of text.matchAll(ENV_READ_RE)) record(usages, match[1], location);
      // Tests legitimately mutate process.env to exercise configuration paths,
      // so only production code is reported as a validation bypass.
      if (!file.endsWith(".test.ts")) {
        for (const match of text.matchAll(PROCESS_ENV_READ_RE)) record(directReads, match[1], location);
      }
    });
  }

  return { usages, directReads };
}

/** Returns the `env.X` keys that are not declared in the schema, sorted. */
export function findUnknownEnvKeys(schemaKeys, usages) {
  const known = new Set(schemaKeys);
  return [...usages.keys()].filter((key) => !known.has(key)).sort();
}

function formatLocations(locations) {
  return locations.map(({ file, line }) => `    ${file}:${line}`).join("\n");
}

export function buildMarkdownReport(schemaKeys, usages, directReads) {
  const lines = [
    "| Variable | Referenced as `env.X` | Where |",
    "| --- | --- | --- |",
  ];
  for (const key of schemaKeys) {
    const locations = usages.get(key) ?? [];
    const files = [...new Set(locations.map(({ file }) => file))].sort();
    lines.push(
      `| \`${key}\` | ${locations.length} | ${files.map((file) => `\`${file}\``).join(", ") || "—"} |`
    );
  }

  const directKeys = [...directReads.keys()].sort();
  if (directKeys.length > 0) {
    lines.push("", "| Direct `process.env` read (bypasses validation) | Where |", "| --- | --- |");
    for (const key of directKeys) {
      const files = [...new Set(directReads.get(key).map(({ file }) => file))].sort();
      lines.push(`| \`${key}\` | ${files.map((file) => `\`${file}\``).join(", ")} |`);
    }
  }
  return lines.join("\n");
}

function main(argv) {
  const schemaSource = readFileSync(SCHEMA_PATH, "utf8");
  const schemaKeys = parseEnvSchemaKeys(schemaSource);
  const files = listTypeScriptFiles(SRC_PATH);
  const { usages, directReads } = collectEnvUsage(files);
  const unknown = findUnknownEnvKeys(schemaKeys, usages);

  console.log(
    `env schema audit (#526): ${schemaKeys.length} schema keys, ` +
      `${usages.size} distinct env.X keys read across ${files.length} files`
  );

  if (argv.includes("--report")) {
    console.log("");
    console.log(buildMarkdownReport(schemaKeys, usages, directReads));
  }

  const directKeys = [...directReads.keys()].sort();
  if (directKeys.length > 0) {
    console.log("");
    console.log("Advisory — direct process.env reads (not validated by the schema):");
    for (const key of directKeys) {
      console.log(`  - ${key}\n${formatLocations(directReads.get(key))}`);
    }
  }

  if (unknown.length === 0) {
    console.log("");
    console.log("OK: every env.X usage corresponds to a key in envSchema.");
    return 0;
  }

  console.error("");
  console.error("FAIL: env.X usage does not exist in envSchema (it is always undefined at runtime):");
  for (const key of unknown) {
    console.error(`  - env.${key}\n${formatLocations(usages.get(key))}`);
  }
  console.error("");
  console.error(
    `Fix the reference, or declare the key in ${SCHEMA_PATH} and document it in apps/backend/.env.example.`
  );
  return 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`env schema audit could not run: ${error.message}`);
    process.exitCode = 1;
  }
}
