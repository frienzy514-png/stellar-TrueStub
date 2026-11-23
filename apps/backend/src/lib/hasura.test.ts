/**
 * End-to-end coverage for the low-level Hasura transport.
 *
 * Every other Hasura test mocks `lib/hasura` at the boundary, so the env-var
 * wiring itself was never executed. `env` is validated at import time, so each
 * test installs a realistic Hasura configuration in process.env and loads the
 * transport in an isolated module registry before mocking fetch.
 */

type HasuraModule = typeof import("./hasura");

const HASURA_URL = "http://localhost:8080/v1/graphql";
const ADMIN_SECRET = "test-hasura-admin-secret";
const LEGACY_SECRET = "legacy-hasura-admin-secret";

function loadConfiguredHasura(): HasuraModule {
  let mod!: HasuraModule;
  jest.isolateModules(() => {
    mod = require("./hasura") as HasuraModule;
  });
  return mod;
}

function restoreEnvVar(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ data }),
  };
}

describe("Hasura transport with a configured environment", () => {
  const originalUrl = process.env.HASURA_GRAPHQL_URL;
  const originalSecret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;
  const originalLegacySecret = process.env.HASURA_ADMIN_SECRET;
  const originalFetch = global.fetch;

  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.HASURA_GRAPHQL_URL = HASURA_URL;
    process.env.HASURA_GRAPHQL_ADMIN_SECRET = ADMIN_SECRET;
    delete process.env.HASURA_ADMIN_SECRET;

    fetchMock = jest.fn().mockResolvedValue(jsonResponse({ escrows: [{ id: "escrow-1" }] }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnvVar("HASURA_GRAPHQL_URL", originalUrl);
    restoreEnvVar("HASURA_GRAPHQL_ADMIN_SECRET", originalSecret);
    restoreEnvVar("HASURA_ADMIN_SECRET", originalLegacySecret);
    global.fetch = originalFetch;
  });

  it("hasuraRequest() sends the configured admin secret header and succeeds", async () => {
    const { hasuraRequest } = loadConfiguredHasura();

    const data = await hasuraRequest<{ escrows: Array<{ id: string }> }>(
      "query { escrows { id } }",
      { limit: 1 },
      { requestId: "test-request-id" }
    );

    expect(data).toEqual({ escrows: [{ id: "escrow-1" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(HASURA_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "content-type": "application/json",
      "x-hasura-admin-secret": ADMIN_SECRET,
      "x-request-id": "test-request-id",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      query: "query { escrows { id } }",
      variables: { limit: 1 },
    });
  });

  it("createHasuraClient().request() sends the configured admin secret header", async () => {
    const { createHasuraClient } = loadConfiguredHasura();
    const client = createHasuraClient();

    await expect(client.request("query { ping }")).resolves.toEqual({
      escrows: [{ id: "escrow-1" }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-hasura-admin-secret"]).toBe(ADMIN_SECRET);
  });

  it("hasuraRequest() uses the legacy HASURA_ADMIN_SECRET alias as the header (#534)", async () => {
    delete process.env.HASURA_GRAPHQL_ADMIN_SECRET;
    process.env.HASURA_ADMIN_SECRET = LEGACY_SECRET;
    const { hasuraRequest } = loadConfiguredHasura();

    await expect(hasuraRequest("query { ping }")).resolves.toEqual({
      escrows: [{ id: "escrow-1" }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-hasura-admin-secret"]).toBe(LEGACY_SECRET);
  });
});
