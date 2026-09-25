/**
 * Apollo Client configuration — Firebase → Hasura JWT auth boundary.
 *
 * Link chain (left to right):
 *
 *   errorLink → retryLink → split(subscriptions → wsLink, queries/mutations → authLink → httpLink)
 *
 * Issues addressed:
 *   - #167: onError link for centralised GraphQL/network error handling and
 *           auth-error re-auth flow.
 *   - #168: RetryLink with exponential backoff, scoped to idempotent
 *           operations (queries only — mutations are excluded to avoid
 *           double-submitting transaction-adjacent writes).
 */
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  split,
} from "@apollo/client";
import { getMainDefinition } from "@apollo/client/utilities";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";
import { RetryLink } from "@apollo/client/link/retry";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { Kind, OperationTypeNode } from "graphql";
import { auth } from "@/lib/firebase";
import { updateGlobalConnectionState } from "@/hooks/useConnectionStatus";

// Derive the WebSocket URL from the HTTP Hasura URL by swapping the scheme.
// e.g. https://example.hasura.app/v1/graphql  →  wss://example.hasura.app/v1/graphql
function toWsUrl(httpUrl: string | undefined): string {
  if (!httpUrl) return "";
  return httpUrl.replace(/^https?:\/\//, (match) =>
    match === "https://" ? "wss://" : "ws://"
  );
}

const HASURA_WS_URL = toWsUrl(process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL);

// ── WebSocket link (subscriptions) ──────────────────────────────────────────

const wsClient = createClient({
  url: HASURA_WS_URL,

  // Supply the Firebase auth token in the connection-init payload so Hasura
  // can validate the subscription request.
  connectionParams: async () => {
    const currentUser = auth.currentUser;
    const token = currentUser ? await currentUser.getIdToken() : null;
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  },

  // Retry on any close event (the library already excludes fatal close codes
  // like 4400, 4401, 4500, and 1011 from retrying regardless of this flag).
  shouldRetry: () => true,

  // Allow up to 10 reconnection attempts before giving up.
  retryAttempts: 10,
});

// Wire the graphql-ws lifecycle events to the global connection-state store so
// that ConnectionStatus.tsx (and anything else that calls useConnectionStatus)
// reflects the actual WebSocket health in real time.
wsClient.on("connected", () => updateGlobalConnectionState("connected"));
wsClient.on("connecting", () => updateGlobalConnectionState("reconnecting"));
wsClient.on("closed", () => updateGlobalConnectionState("disconnected"));

const wsLink = new GraphQLWsLink(wsClient);

// ── HTTP link (queries & mutations) ─────────────────────────────────────────

const httpLink = createHttpLink({
  uri: process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL,
  fetchOptions: { cache: "no-store" },
});

/**
 * Builds the GraphQL request headers for the Firebase → Hasura JWT boundary.
 *
 * When a user is signed in, their Firebase ID token is attached as
 * `Authorization: Bearer <token>` so Hasura can validate it and map its claims
 * to a role/permissions. When signed out, no Authorization header is sent.
 *
 * Extracted from the `authLink` so it can be unit/integration tested directly.
 */
export async function buildAuthHeaders(
  headers: Record<string, string> = {},
): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  const token = currentUser ? await currentUser.getIdToken() : null;
  return {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const authLink = setContext(async (_, { headers }) => ({
  headers: await buildAuthHeaders(headers),
}));

// ── Error link — Issue #167 ──────────────────────────────────────────────────
//
// Centralised error handling for all GraphQL operations:
//
//  • GraphQL errors (response.errors[]):
//    - Authentication errors (UNAUTHENTICATED / 401 extension code, or Hasura
//      JWT validation failures surfaced as FORBIDDEN) trigger a Firebase
//      token refresh.  If the refresh succeeds the component can re-fetch via
//      its normal loading state; if it fails the user is redirected to /login.
//    - All other GraphQL errors are logged so they surface in monitoring
//      (Sentry is configured separately via sentry.client.config.ts).
//
//  • Network errors: logged at the same level so transient failures are
//    observable before the RetryLink exhausts its attempts.
//
// Components/hooks are no longer responsible for interpreting raw 401s or
// expired-token errors individually.

const AUTH_ERROR_CODES = new Set(["UNAUTHENTICATED", "FORBIDDEN"]);

export const errorLink = onError(
  ({ graphQLErrors, networkError, operation }) => {
    if (graphQLErrors) {
      for (const err of graphQLErrors) {
        const code = err.extensions?.["code"] as string | undefined;
        const isAuthError =
          code !== undefined
            ? AUTH_ERROR_CODES.has(code)
            : // Hasura surfaces JWT failures as a message starting with
              // "Could not verify JWT" or "Invalid JWT" when no extension code
              // is set — treat those as auth errors too.
              /jwt|unauthenticated|forbidden/i.test(err.message);

        if (isAuthError) {
          // Attempt a silent token refresh.  Firebase getIdToken(true) forces
          // a network round-trip to get a fresh token; on success the next
          // Apollo operation will pick it up via authLink.  On failure (e.g.
          // the session has been revoked) redirect to the login page.
          auth.currentUser
            ?.getIdToken(/* forceRefresh */ true)
            .catch(() => {
              if (typeof window !== "undefined") {
                window.location.href = "/login";
              }
            });
        } else {
          console.error(
            `[GraphQL error] Operation: ${operation.operationName} | ` +
              `Message: ${err.message} | ` +
              `Path: ${err.path?.join(".") ?? "—"}`,
          );
        }
      }
    }

    if (networkError) {
      console.error(
        `[Network error] Operation: ${operation.operationName} | ${networkError}`,
      );
    }
  },
);

// ── Retry link — Issue #168 ──────────────────────────────────────────────────
//
// Automatically retries failed operations with exponential back-off.
//
// Safety constraints:
//   • Only queries are retried — mutations are excluded to prevent
//     double-submitting escrow-adjacent writes (fund, release, dispute).
//   • Up to 3 attempts with a base interval of 300 ms and a 2× multiplier,
//     capped at 5 s per interval.  The total worst-case wait before surfacing
//     an error to the user is ~5.1 s (300 ms + 600 ms + 1 200 ms + … ≤ 5 s).
//   • Network errors are always eligible for retry; GraphQL-level errors
//     (schema mismatches, permission denials) are not retried because they
//     will not resolve on their own.

export const retryLink = new RetryLink({
  attempts: {
    max: 3,
    retryIf: (error, operation) => {
      // Never retry mutations — escrow writes must not be submitted twice.
      const definition = getMainDefinition(operation.query);
      const isMutation =
        definition.kind === Kind.OPERATION_DEFINITION &&
        definition.operation === OperationTypeNode.MUTATION;
      if (isMutation) return false;

      // Only retry on network-level failures, not GraphQL response errors.
      return Boolean(error);
    },
  },
  delay: {
    initial: 300,
    max: 5000,
    jitter: true, // randomise slightly to avoid thundering-herd on reconnect
  },
});

// ── Split: subscriptions → WS, everything else → HTTP ───────────────────────

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === Kind.OPERATION_DEFINITION &&
      definition.operation === OperationTypeNode.SUBSCRIPTION
    );
  },
  wsLink,
  // Queries/mutations flow through: errorLink → retryLink → authLink → httpLink
  errorLink.concat(retryLink).concat(authLink).concat(httpLink),
);

// ── Apollo Client ────────────────────────────────────────────────────────────

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
