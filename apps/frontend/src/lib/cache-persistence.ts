/**
 * Apollo Cache Persistence — strategy & lifecycle
 * ================================================
 *
 * ## What is persisted
 * The entire Apollo `InMemoryCache` is serialised to JSON and written to
 * `localStorage` under the key **`truestub-apollo-cache`**.  This includes
 * every query result cached during the session (escrow lists, user profiles,
 * ticket metadata, GraphQL query results from Hasura, etc.).
 *
 * ## Trigger
 * The cache is written on **every Apollo cache write** (`trigger: 'write'`),
 * so the persisted snapshot is always up-to-date.
 *
 * ## Size limit
 * The maximum serialised size is **5 MB** (`maxSize: 5 * 1_048_576`).  If a
 * write would exceed this limit `apollo-cache-persist` silently skips the
 * persist; the in-memory cache is unaffected.
 *
 * ## Expiry / versioning
 * `apollo-cache-persist` v0 does **not** support TTL-based expiry out of the
 * box.  Cache entries survive until:
 * 1. The user logs out (see `clearPersistedCache` below).
 * 2. The app explicitly calls `clearPersistedCache` (e.g. on a critical
 *    error via `ErrorBoundaryWithCache`).
 * 3. The user clears browser storage manually.
 *
 * If you change the shape of a cached type (field rename, type change) you
 * **must** either bump the storage key or call `clearPersistedCache` at
 * app startup to avoid feeding stale, mis-shaped data into Apollo.  A
 * recommended pattern is to embed a schema-version in the key, e.g.
 * `truestub-apollo-cache-v2`.
 *
 * ## Shared-device / logout risk
 * Stale data from one user's session would be visible to the next user on a
 * shared device if the cache is not cleared on logout.  **`LogoutButton`
 * therefore calls `clearPersistedCache` as part of every sign-out flow.**
 * If you add alternative sign-out paths (e.g. session expiry middleware, SSO
 * logout redirects) you must call `clearPersistedCache` in those paths too.
 */

import { persistCache } from 'apollo-cache-persist';
import { InMemoryCache } from '@apollo/client';

/** localStorage key used for the persisted Apollo cache snapshot. */
export const CACHE_PERSISTENCE_KEY = 'truestub-apollo-cache';

/**
 * Initialises Apollo cache persistence to `localStorage`.
 *
 * Must be called **once**, before the Apollo client makes its first request,
 * and only in browser contexts (`typeof window !== 'undefined'`).
 *
 * @param cache - The `InMemoryCache` instance attached to your Apollo client.
 */
export const setupCachePersistence = async (cache: InMemoryCache) => {
    if (typeof window === 'undefined') return;

    try {
        await persistCache({
            cache,
            storage: window.localStorage as any,
            maxSize: 1048576 * 5, // 5 MB cache limit
            debug: process.env.NODE_ENV === 'development',
            trigger: 'write', // Persist on every write
            key: CACHE_PERSISTENCE_KEY,
        });

        console.log('✅ Apollo cache persistence initialized');
    } catch (error) {
        console.warn('⚠️ Cache persistence setup failed:', error);
    }
};

/**
 * Removes the persisted Apollo cache snapshot from `localStorage`.
 *
 * **Call this on every sign-out path** to prevent stale data from one user
 * session leaking into the next session on a shared device.
 */
export const clearPersistedCache = async () => {
    if (typeof window === 'undefined') return;

    try {
        await window.localStorage.removeItem(CACHE_PERSISTENCE_KEY);
        console.log('🗑️ Persisted cache cleared');
    } catch (error) {
        console.error('Failed to clear persisted cache:', error);
    }
};
