import { mkdtempSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { Client } from "pg";
import {
  assertHasuraReachable,
  computePendingMigrations,
  HASURA_CHECK_TIMEOUT_MS,
  listMigrationNames,
  assertMigrationsUpToDate,
} from "./startup-checks";
import { hasuraClient } from "./hasura";
import { env } from "../config/env";

jest.mock("pg", () => ({ Client: jest.fn() }));
jest.mock("./hasura", () => ({ hasuraClient: { request: jest.fn() } }));
jest.mock("../config/env", () => ({ env: {} as Record<string, string | undefined> }));
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

describe("assertHasuraReachable", () => {
  const mockedRequest = hasuraClient.request as unknown as jest.Mock;
  const mutableEnv = env as unknown as Record<string, string | undefined>;

  beforeEach(() => {
    mutableEnv.HASURA_GRAPHQL_URL = undefined;
    mutableEnv.HASURA_GRAPHQL_ADMIN_SECRET = undefined;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("skips the check when Hasura is not configured", async () => {
    await expect(assertHasuraReachable()).resolves.toBeUndefined();
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("fails when only one of URL or admin secret is set", async () => {
    mutableEnv.HASURA_GRAPHQL_URL = "https://hasura.example.com/v1/graphql";
    await expect(assertHasuraReachable()).rejects.toThrow(/partially configured/);
    expect(mockedRequest).not.toHaveBeenCalled();
  });

  it("resolves when Hasura answers the startup query", async () => {
    mutableEnv.HASURA_GRAPHQL_URL = "https://hasura.example.com/v1/graphql";
    mutableEnv.HASURA_GRAPHQL_ADMIN_SECRET = "s3cret-value";
    mockedRequest.mockResolvedValueOnce({ __typename: "query_root" });
    await expect(assertHasuraReachable()).resolves.toBeUndefined();
  });

  it("fails with a clear message and without leaking the admin secret", async () => {
    mutableEnv.HASURA_GRAPHQL_URL = "https://hasura.example.com/v1/graphql";
    mutableEnv.HASURA_GRAPHQL_ADMIN_SECRET = "s3cret-value";
    mockedRequest.mockRejectedValueOnce(new Error("Hasura request failed: invalid admin secret"));

    const failure = assertHasuraReachable();
    await expect(failure).rejects.toThrow(/Hasura connectivity check failed for https:\/\/hasura\.example\.com/);
    await expect(failure).rejects.not.toThrow(/s3cret-value/);
  });

  it("fails when Hasura does not answer within the timeout", async () => {
    jest.useFakeTimers();
    mutableEnv.HASURA_GRAPHQL_URL = "https://hasura.example.com/v1/graphql";
    mutableEnv.HASURA_GRAPHQL_ADMIN_SECRET = "s3cret-value";
    mockedRequest.mockReturnValueOnce(new Promise(() => undefined));

    const failure = assertHasuraReachable();
    jest.advanceTimersByTime(HASURA_CHECK_TIMEOUT_MS);
    await expect(failure).rejects.toThrow(/no response within/);
  });
});
