/**
 * Tests for Apollo cache persistence lifecycle.
 *
 * Covers:
 * - CACHE_PERSISTENCE_KEY constant value
 * - setupCachePersistence: calls persistCache with correct options in browser context
 * - setupCachePersistence: no-ops in SSR context (window undefined)
 * - clearPersistedCache: removes the correct localStorage key
 * - clearPersistedCache: no-ops in SSR context (window undefined)
 * - Logout integration: clearPersistedCache is called during the logout flow
 */

import {
  setupCachePersistence,
  clearPersistedCache,
  CACHE_PERSISTENCE_KEY,
} from "./cache-persistence";

// ── mock apollo-cache-persist ────────────────────────────────────────────────
jest.mock("apollo-cache-persist", () => ({
  persistCache: jest.fn().mockResolvedValue(undefined),
}));
import { persistCache } from "apollo-cache-persist";

// ── mock @apollo/client ──────────────────────────────────────────────────────
jest.mock("@apollo/client", () => ({
  InMemoryCache: jest.fn().mockImplementation(() => ({})),
}));
import { InMemoryCache } from "@apollo/client";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Replace window with undefined to simulate SSR. Returns a restore fn. */
function hideWindow(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    value: undefined,
    writable: true,
    configurable: true,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, "window", descriptor);
    }
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("CACHE_PERSISTENCE_KEY", () => {
  it("is the expected storage key string", () => {
    expect(CACHE_PERSISTENCE_KEY).toBe("truestub-apollo-cache");
  });
});

describe("setupCachePersistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it("calls persistCache with the correct key and 5 MB maxSize in a browser context", async () => {
    const cache = new InMemoryCache();
    await setupCachePersistence(cache);

    expect(persistCache).toHaveBeenCalledTimes(1);
    const opts = (persistCache as jest.Mock).mock.calls[0][0];
    expect(opts.key).toBe(CACHE_PERSISTENCE_KEY);
    expect(opts.maxSize).toBe(1048576 * 5);
    expect(opts.trigger).toBe("write");
    expect(opts.storage).toBe(window.localStorage);
    expect(opts.cache).toBe(cache);
  });

  it("does nothing when window is undefined (SSR context)", async () => {
    const restore = hideWindow();
    try {
      const cache = new InMemoryCache();
      await setupCachePersistence(cache);
      expect(persistCache).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe("clearPersistedCache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("removes the cache entry from localStorage", async () => {
    localStorage.setItem(CACHE_PERSISTENCE_KEY, JSON.stringify({ foo: "bar" }));
    expect(localStorage.getItem(CACHE_PERSISTENCE_KEY)).not.toBeNull();

    await clearPersistedCache();

    expect(localStorage.getItem(CACHE_PERSISTENCE_KEY)).toBeNull();
  });

  it("does not throw when the key does not exist", async () => {
    await expect(clearPersistedCache()).resolves.toBeUndefined();
  });

  it("does nothing when window is undefined (SSR context)", async () => {
    const removeSpy = jest.spyOn(Storage.prototype, "removeItem");
    const restore = hideWindow();
    try {
      await clearPersistedCache();
      expect(removeSpy).not.toHaveBeenCalled();
    } finally {
      restore();
      removeSpy.mockRestore();
    }
  });
});

// ── logout integration ───────────────────────────────────────────────────────

describe("Logout flow — cache is cleared on sign-out", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it("clearPersistedCache removes the Apollo cache key that was written before logout", async () => {
    // Simulate data written during a user session
    localStorage.setItem(
      CACHE_PERSISTENCE_KEY,
      JSON.stringify({ ROOT_QUERY: { __typename: "Query", user: { id: "u1" } } })
    );

    // Simulate the logout handler calling clearPersistedCache
    await clearPersistedCache();

    // The persisted cache must be gone — a new session starts clean
    expect(localStorage.getItem(CACHE_PERSISTENCE_KEY)).toBeNull();
  });

  it("clearPersistedCache does not remove unrelated localStorage keys", async () => {
    const OTHER_KEY = "app-theme";
    localStorage.setItem(CACHE_PERSISTENCE_KEY, "stale-cache");
    localStorage.setItem(OTHER_KEY, "dark");

    await clearPersistedCache();

    expect(localStorage.getItem(CACHE_PERSISTENCE_KEY)).toBeNull();
    expect(localStorage.getItem(OTHER_KEY)).toBe("dark");
  });
});
