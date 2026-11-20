/**
 * Low-level Hasura transport (the bottom layer of backend → Hasura access).
 *
 * How backend code talks to Hasura:
 *
 *   routes / jobs  →  services/hasura.service.ts (HasuraService)  →  lib/hasura.ts (this file)  →  Hasura
 *
 * - This file owns ONLY the HTTP transport: reading the admin secret from
 *   validated env, sending it as a header, forwarding the request ID and
 *   turning GraphQL errors into thrown errors. It holds no domain queries.
 * - `HasuraService` (services/hasura.service.ts) is where domain operations
 *   live (escrow status writes, notifications, refund retry counters, ...).
 *   New code that needs Hasura should add or reuse a `HasuraService` method
 *   rather than calling this client directly.
 * - Import from this file directly only when building a new service, or in
 *   tests that need to mock the transport.
 */
import { env } from "../config/env";
import { getCorrelationId } from "../middleware/requestLogger";

interface HasuraResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export interface HasuraRequestOptions {
  /**
   * Correlation ID for the originating request. When omitted, the ID from the
   * active request context (if any) is used so status updates in the
   * refund→dispute→changelog chain stay traceable.
   */
  requestId?: string;
}

export interface HasuraClient {
  request<T>(
    query: string,
    variables?: Record<string, unknown>,
    options?: HasuraRequestOptions
  ): Promise<T>;
}

function requireHasuraConfig(): { url: string; adminSecret: string } {
  const url = env.HASURA_GRAPHQL_URL;
  const adminSecret = env.HASURA_GRAPHQL_ADMIN_SECRET;

  if (!url || !adminSecret) {
    throw new Error(
      "HASURA_GRAPHQL_URL and HASURA_GRAPHQL_ADMIN_SECRET must be configured for Hasura requests"
    );
  }

  return { url, adminSecret };
}

/**
 * Creates the backend-only Hasura admin client.
 *
 * The admin secret is read from validated server environment configuration and
 * is sent only in the request header. It is never included in logs, errors, or
 * the returned client object.
 */
export function createHasuraClient(): HasuraClient {
  return {
    async request<T>(
      query: string,
      variables: Record<string, unknown> = {},
      options: HasuraRequestOptions = {}
    ): Promise<T> {
      const { url, adminSecret } = requireHasuraConfig();
      const requestId = options.requestId ?? getCorrelationId();
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      };
      if (requestId) {
        headers["x-request-id"] = requestId;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
      });

      const json = (await response.json()) as HasuraResponse<T>;
      if (!response.ok || json.errors?.length) {
        const detail = json.errors?.map(({ message }) => message).join("; ") ?? response.statusText;
        const context = requestId ? ` (requestId=${requestId})` : "";
        throw new Error(`Hasura request failed${context}: ${detail}`);
      }
      if (json.data === undefined) {
        const context = requestId ? ` (requestId=${requestId})` : "";
        throw new Error(`Hasura request returned no data${context}`);
      }
      return json.data;
    },
  };
}

export const hasuraClient = createHasuraClient();

export async function hasuraRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: HasuraRequestOptions = {}
): Promise<T> {
  return hasuraClient.request<T>(query, variables, options);
}
