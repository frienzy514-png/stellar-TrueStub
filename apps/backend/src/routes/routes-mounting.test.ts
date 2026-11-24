/**
 * Structural test: every router exported from a file under
 * `apps/backend/src/routes/` is actually wired into the Express app in
 * `index.ts` (#626).
 *
 * This closes the whole class of "a route file exists, compiles, and is well
 * written, but was never mounted" bugs — the same class that left
 * `analyticsRouter` dead on arrival until #620. Adding a new route file and
 * forgetting to mount it makes this test fail.
 *
 * The check is purely textual: it reads each route file's source for an
 * `export const fooRouter` / `export function fooRouter`, then reads
 * `index.ts` and asserts each discovered router is both imported and passed
 * to `app.use(...)` inside `createApp()`. Reading source (instead of importing
 * the modules) keeps the test free of any module side effects or env
 * requirements, and means a brand-new route file is caught even if its module
 * would fail to load in the test environment.
 */
import * as fs from "fs";
import * as path from "path";

const ROUTES_DIR = __dirname;
const INDEX_PATH = path.join(__dirname, "..", "index.ts");

/** Names of routers exported from one route file's source. */
function routerExportsFromFile(source: string): string[] {
  const names = new Set<string>();
  // Matches `export const fooRouter = ...` and `export function fooRouter(...)`.
  // The captured identifier must end in "Router", so non-router exports (e.g.
  // `verifyRequestUser`, `startProcessedWebhookEventCleanup`, `amountOf`) are
  // ignored even though they live in route files.
  const pattern = /export\s+(?:const|function)\s+([A-Za-z_$][\w$]*Router)\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    names.add(match[1]);
  }
  return Array.from(names);
}

function readRouteFiles(): Array<{ file: string; routers: string[] }> {
  return fs
    .readdirSync(ROUTES_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => ({
      file,
      routers: routerExportsFromFile(
        fs.readFileSync(path.join(ROUTES_DIR, file), "utf8"),
      ),
    }))
    .filter((entry) => entry.routers.length > 0);
}

describe("structural: every exported router is mounted in index.ts (#626)", () => {
  const indexSource = fs.readFileSync(INDEX_PATH, "utf8");
  // `app.use(...)` mounts in index.ts are single-line in this codebase, so a
  // line-level scan is sufficient and avoids balancing nested parentheses
  // (e.g. `app.use(express.json({ verify: captureRawBody }))`).
  const mountLines = indexSource
    .split(/\r?\n/)
    .filter((line) => /\bapp\.use\s*\(/.test(line));

  const routeFiles = readRouteFiles();
  const allRouters: Array<{ file: string; name: string }> = routeFiles.flatMap(
    ({ file, routers }) => routers.map((name) => ({ file, name })),
  );

  it("discovers the known route files and routers (guards against a silent empty run)", () => {
    expect(allRouters.length).toBeGreaterThan(0);
    const discovered = allRouters.map((router) => router.name);
    for (const name of [
      "healthRouter",
      "listingsRouter",
      "savedSearchesRouter",
      "watchlistRouter",
      "webhookRouter",
      "refundsRouter",
      "transfersRouter",
      "changelogRouter",
      "disputesRouter",
      "usersRouter",
      "recoveryCodesRouter",
      "adminUsersRouter",
      "analyticsRouter",
      "syncUserRouter",
    ]) {
      expect(discovered).toContain(name);
    }
  });

  it.each(allRouters)(
    "$name (exported by $file) is imported in index.ts",
    ({ name }) => {
      expect(indexSource).toContain(name);
    },
  );

  it.each(allRouters)(
    "$name (exported by $file) is mounted via app.use() in createApp()",
    ({ name }) => {
      expect(mountLines.some((line) => line.includes(name))).toBe(true);
    },
  );
});
