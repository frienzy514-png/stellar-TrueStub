import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateEnv, envSchema } from "./env";

describe("Backend Environment Validation", () => {
  it("should supply default values when optional vars are omitted", () => {
    const parsed = validateEnv({});
    assert.equal(parsed.PORT, 4000);
    assert.equal(parsed.NODE_ENV, "development");
    assert.equal(parsed.TRUSTLESS_WORK_WEBHOOK_SECRET, undefined);
    assert.equal(parsed.HASURA_GRAPHQL_URL, undefined);
    assert.equal(parsed.HASURA_GRAPHQL_ADMIN_SECRET, undefined);
  });

  it("should parse valid custom PORT and NODE_ENV", () => {
    const parsed = validateEnv({
      PORT: "5050",
      NODE_ENV: "production",
    });
    assert.equal(parsed.PORT, 5050);
    assert.equal(parsed.NODE_ENV, "production");
  });

  it("should parse valid roadmap variables when provided", () => {
    const parsed = validateEnv({
      PORT: "4000",
      NODE_ENV: "test",
      TRUSTLESS_WORK_WEBHOOK_SECRET: "whsec_test123",
      HASURA_GRAPHQL_URL: "https://graphql.example.com/v1/graphql",
      HASURA_GRAPHQL_ADMIN_SECRET: "admin_secret_456",
    });
    assert.equal(parsed.TRUSTLESS_WORK_WEBHOOK_SECRET, "whsec_test123");
    assert.equal(parsed.HASURA_GRAPHQL_URL, "https://graphql.example.com/v1/graphql");
    assert.equal(parsed.HASURA_GRAPHQL_ADMIN_SECRET, "admin_secret_456");
  });

  it("should throw a descriptive error on non-numeric PORT", () => {
    assert.throws(
      () => validateEnv({ PORT: "not-a-number" }),
      (err: Error) => {
        assert.match(err.message, /Invalid environment variables/);
        assert.match(err.message, /PORT/);
        return true;
      }
    );
  });

  it("should throw on out-of-range PORT", () => {
    assert.throws(
      () => validateEnv({ PORT: "70000" }),
      (err: Error) => {
        assert.match(err.message, /PORT/);
        return true;
      }
    );

    assert.throws(
      () => validateEnv({ PORT: "0" }),
      (err: Error) => {
        assert.match(err.message, /PORT/);
        return true;
      }
    );
  });

  it("should throw on invalid NODE_ENV", () => {
    assert.throws(
      () => validateEnv({ NODE_ENV: "invalid_env" as any }),
      (err: Error) => {
        assert.match(err.message, /NODE_ENV/);
        return true;
      }
    );
  });

  it("should throw on invalid HASURA_GRAPHQL_URL URL format", () => {
    assert.throws(
      () => validateEnv({ HASURA_GRAPHQL_URL: "not-a-valid-url" }),
      (err: Error) => {
        assert.match(err.message, /HASURA_GRAPHQL_URL/);
        return true;
      }
    );
  });
});
