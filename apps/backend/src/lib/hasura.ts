import { env } from "../config/env";

interface HasuraResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export interface HasuraClient {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
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
    async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
      const { url, adminSecret } = requireHasuraConfig();
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hasura-admin-secret": adminSecret,
        },
        body: JSON.stringify({ query, variables }),
      });

      const json = (await response.json()) as HasuraResponse<T>;
      if (!response.ok || json.errors?.length) {
        const detail = json.errors?.map(({ message }) => message).join("; ") ?? response.statusText;
        throw new Error(`Hasura request failed: ${detail}`);
      }
      if (json.data === undefined) {
        throw new Error("Hasura request returned no data");
      }
      return json.data;
    },
  };
}

export const hasuraClient = createHasuraClient();

export async function hasuraRequest<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  return hasuraClient.request<T>(query, variables);
}
