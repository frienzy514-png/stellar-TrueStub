/**
 * useWalletPersistence
 *
 * Persists the user's last-chosen wallet type in localStorage so the wallet
 * connection modal can pre-select it on the next visit.
 *
 * Security contract:
 *  - Only the wallet *type* identifier (e.g. "freighter") is stored — never
 *    private keys, addresses, session tokens, or any other sensitive data.
 *  - The stored value is used exclusively to pre-fill the UI; it does NOT
 *    trigger an automatic connection.  The user must still click "Connect".
 */
import { useCallback, useEffect, useState } from "react";
import { WalletType } from "../types/wallet.types";

const STORAGE_KEY = "truestub:lastWalletType";

/**
 * Read the persisted wallet type from localStorage.
 * Returns null when nothing is stored or when running server-side.
 */
export const getPersistedWalletType = (): WalletType | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    // Only accept known wallet type strings to guard against tampered storage.
    const KNOWN: WalletType[] = [
      "freighter",
      "albedo",
      "lobstr",
      "metamask",
      "walletconnect",
    ];
    return KNOWN.includes(raw as WalletType) ? (raw as WalletType) : null;
  } catch {
    // Privacy mode or storage quota exceeded — silently ignore.
    return null;
  }
};

/**
 * Persist the selected wallet type to localStorage.
 * Passing null clears the stored value (e.g. after explicit logout).
 */
export const persistWalletType = (walletType: WalletType | null): void => {
  if (typeof window === "undefined") return;
  try {
    if (walletType === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, walletType);
    }
  } catch {
    // Silently ignore write failures (private browsing, quota, etc.).
  }
};

/**
 * React hook that wraps the persistence helpers with reactive state.
 *
 * @returns
 *   - `lastWalletType`   — the persisted wallet type (or null if none)
 *   - `saveWalletType`   — call this when the user picks a wallet
 *   - `clearWalletType`  — call this when the user explicitly logs out
 */
export const useWalletPersistence = () => {
  const [lastWalletType, setLastWalletType] = useState<WalletType | null>(
    null,
  );

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    setLastWalletType(getPersistedWalletType());
  }, []);

  const saveWalletType = useCallback((walletType: WalletType) => {
    persistWalletType(walletType);
    setLastWalletType(walletType);
  }, []);

  const clearWalletType = useCallback(() => {
    persistWalletType(null);
    setLastWalletType(null);
  }, []);

  return { lastWalletType, saveWalletType, clearWalletType };
};
