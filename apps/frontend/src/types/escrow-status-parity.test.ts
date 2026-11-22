/**
 * Audit test for issue #547: the frontend `RefundStatus` union in
 * `./escrow.ts` must match the status values the backend actually persists
 * in `apps/backend/src/services/refund.service.ts`, in both directions.
 *
 * The two apps do not share code, so the union literals are read straight
 * from each source file and compared as sets. This fails loudly when either
 * side adds, renames or drops a status without updating the other.
 */
import { readFileSync } from "fs";
import { join } from "path";

const FRONTEND_TYPES = join(__dirname, "escrow.ts");
const BACKEND_REFUND_SERVICE = join(__dirname, "..", "..", "..", "backend", "src", "services", "refund.service.ts");

/** Extract the string literals of `export type <name> = 'a' | 'b' ...;` (quotes optional). */
function readUnion(source: string, typeName: string): string[] {
  const pattern = new RegExp(`export\\s+type\\s+${typeName}\\s*=([^;]+);`, "m");
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not find \`export type ${typeName}\` in source`);
  }
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]).sort();
}

describe("escrow status parity (#547)", () => {
  const frontendSource = readFileSync(FRONTEND_TYPES, "utf8");
  const backendSource = readFileSync(BACKEND_REFUND_SERVICE, "utf8");

  it("frontend RefundStatus contains every status the backend persists", () => {
    const frontend = readUnion(frontendSource, "RefundStatus");
    const backend = readUnion(backendSource, "RefundStatus");

    const missingInFrontend = backend.filter((s) => !frontend.includes(s));
    expect(missingInFrontend).toEqual([]);
  });

  it("frontend RefundStatus has no values the backend never persists", () => {
    const frontend = readUnion(frontendSource, "RefundStatus");
    const backend = readUnion(backendSource, "RefundStatus");

    const extraInFrontend = frontend.filter((s) => !backend.includes(s));
    expect(extraInFrontend).toEqual([]);
  });

  it("the two RefundStatus unions are identical as sets", () => {
    expect(readUnion(frontendSource, "RefundStatus")).toEqual(readUnion(backendSource, "RefundStatus"));
  });
});
