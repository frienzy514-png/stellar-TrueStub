import { mkdtempSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { Client } from "pg";
import {
  computePendingMigrations,
  listMigrationNames,
  assertMigrationsUpToDate,
} from "./startup-checks";

jest.mock("pg", () => ({ Client: jest.fn() }));
jest.mock("./logger", () => ({ logger: { warn: jest.fn(), fatal: jest.fn(), info: jest.fn() } }));

describe("listMigrationNames", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "migrations-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns sorted migration names without the .sql extension and ignores other files", async () => {
    writeFileSync(path.join(dir, "002_second.sql"), "");
    writeFileSync(path.join(dir, "001_first.sql"), "");
    writeFileSync(path.join(dir, "README.md"), "");

    await expect(listMigrationNames(dir)).resolves.toEqual(["001_first", "002_second"]);
  });
});

describe("computePendingMigrations", () => {
  it("returns expected migrations missing from the applied list, preserving order", () => {
    expect(
      computePendingMigrations(["001_a", "002_b", "003_c"], ["001_a", "003_c"]),
    ).toEqual(["002_b"]);
  });

  it("returns nothing when every expected migration is applied", () => {
    expect(computePendingMigrations(["001_a"], ["001_a", "999_extra"])).toEqual([]);
  });
});

describe("assertMigrationsUpToDate", () => {
  let dir: string;
  const mockedClient = Client as unknown as jest.Mock;

  function mockAppliedRows(rows: Array<{ name: string }>) {
    mockedClient.mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue({ rows }),
      end: jest.fn().mockResolvedValue(undefined),
    }));
  }

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "migrations-"));
    writeFileSync(path.join(dir, "001_a.sql"), "");
    writeFileSync(path.join(dir, "002_b.sql"), "");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves when every shipped migration is recorded", async () => {
    mockAppliedRows([{ name: "001_a" }, { name: "002_b" }]);
    await expect(assertMigrationsUpToDate("postgres://db", dir)).resolves.toBeUndefined();
  });

  it("rejects naming the pending migrations and the fix command", async () => {
    mockAppliedRows([{ name: "001_a" }]);
    await expect(assertMigrationsUpToDate("postgres://db", dir)).rejects.toThrow(
      /Database schema is out of date: 1 pending migration\(s\): 002_b.*migrate:up/,
    );
  });
});
