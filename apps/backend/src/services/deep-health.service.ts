import { Client } from "pg";
import { env } from "../config/env";
import { hasuraClient } from "../lib/hasura";

export type DependencyHealthStatus = "healthy" | "down" | "misconfigured";

export interface DependencyHealth {
  status: DependencyHealthStatus;
  detail?: string;
}

export interface DeepHealthResult {
  status: "healthy" | "degraded" | "down";
  service: "truestub-backend";
  dependencies: {
    postgres: DependencyHealth;
    hasura: DependencyHealth;
  };
}

const HASURA_HEALTH_QUERY = "query HealthCheck { __typename }";

async function checkPostgres(): Promise<DependencyHealth> {
  if (!env.DATABASE_URL) {
    return { status: "misconfigured", detail: "DATABASE_URL is not configured" };
  }

  const client = new Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS,
    query_timeout: env.PG_QUERY_TIMEOUT_MS,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return { status: "healthy" };
  } catch {
    return { status: "down", detail: "connection failed" };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkHasura(): Promise<DependencyHealth> {
  if (!env.HASURA_GRAPHQL_URL || !env.HASURA_GRAPHQL_ADMIN_SECRET) {
    return { status: "misconfigured", detail: "Hasura URL or admin secret is not configured" };
  }

  try {
    await hasuraClient.request(HASURA_HEALTH_QUERY);
    return { status: "healthy" };
  } catch {
    return { status: "down", detail: "request failed" };
  }
}

export async function checkDeepHealth(): Promise<DeepHealthResult> {
  const [postgres, hasura] = await Promise.all([checkPostgres(), checkHasura()]);
  const dependencies = { postgres, hasura };
  const statuses = Object.values(dependencies).map(({ status }) => status);
  const healthy = statuses.filter((status) => status === "healthy").length;

  return {
    status: healthy === statuses.length ? "healthy" : healthy === 0 ? "down" : "degraded",
    service: "truestub-backend",
    dependencies,
  };
}
