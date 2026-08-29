/**
 * useWalletSessionGuard
 *
 * Monitors active wallet sessions for disconnection or lock events and
 * surfaces a "reconnect" prompt when the wallet becomes unavailable
 * mid-session (e.g. the user locks Freighter while an escrow form is open).
 *
 * How it works:
 *  - For Freighter: polls `getAddress()` every `pollInterval` ms.  If the
 *    address disappears (extension locked or permission revoked) the guard
 *    fires the `onDisconnected` callback.
 *  - For MetaMask: subscribes to the `accountsChanged` and
 *    `chainChanged` provider events.
 *  - For WalletConnect: subscribes to session disconnect events via the
 *    `disconnect` event on the EIP-1193 provider.
 *
 * The guard does NOT automatically reconnect; it only notifies the UI so the
 * user can be prompted to reconnect explicitly.
 */
import { useCallback, useEffect, useRef } from "react";
import { getAddress } from "@stellar/freighter-api";
import { WalletType, WalletInfo } from "../types/wallet.types";

export interface WalletSessionGuardOptions {
  /** The currently connected wallets to monitor. */
  connectedWallets: WalletInfo[];
  /**
   * Called when a wallet session is lost.
   * @param walletType - The wallet whose session was lost.
   * @param reason     - Human-readable description of what happened.
   */
  onDisconnected: (walletType: WalletType, reason: string) => void;
  /**
   * How often (in ms) to poll Freighter for session validity.
   * Defaults to 5000 ms.
   */
  pollInterval?: number;
  /** Set to false to disable the guard (e.g. while a reconnect dialog is open). */
  enabled?: boolean;
}

const DEFAULT_POLL_INTERVAL = 5_000;

/**
 * Stellar (Freighter) wallet session guard via polling.
 */
const useStellarSessionGuard = (
  connectedWallets: WalletInfo[],
  onDisconnected: (walletType: WalletType, reason: string) => void,
  pollInterval: number,
  enabled: boolean,
) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    const stellarWallets = connectedWallets.filter(
      (w) => w.chain === "stellar",
    );
    if (stellarWallets.length === 0) return;

    try {
      const { address } = await getAddress();
      // If Freighter returns no address, the extension has been locked or
      // the site permission has been revoked.
      if (!address) {
        stellarWallets.forEach((w) => {
          onDisconnected(
            w.walletType,
            "Your Stellar wallet has been locked or disconnected. Please reconnect to continue.",
          );
        });
      }
    } catch {
      // Any error from Freighter API means the session is gone.
      stellarWallets.forEach((w) => {
        onDisconnected(
          w.walletType,
          "Your Stellar wallet session has ended. Please reconnect.",
        );
      });
    }
  }, [connectedWallets, onDisconnected]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const hasStellarWallet = connectedWallets.some(
      (w) => w.chain === "stellar",
    );
    if (!hasStellarWallet) return;

    timerRef.current = setInterval(check, pollInterval);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [check, connectedWallets, pollInterval, enabled]);
};

/**
 * Ethereum (MetaMask / WalletConnect) wallet session guard via provider events.
 */
const useEthereumSessionGuard = (
  connectedWallets: WalletInfo[],
  onDisconnected: (walletType: WalletType, reason: string) => void,
  enabled: boolean,
) => {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const ethWallets = connectedWallets.filter(
      (w) => w.chain === "ethereum" || w.chain === "bsc",
    );
    if (ethWallets.length === 0) return;

    const provider = (window as any).ethereum;
    if (!provider) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // MetaMask was locked or the last account was disconnected.
        ethWallets.forEach((w) => {
          onDisconnected(
            w.walletType,
            "Your MetaMask account has been disconnected or locked. Please reconnect.",
          );
        });
      }
      // If accounts changed to a *different* address we leave that for the
      // account-switching feature (#95) to handle.
    };

    const handleDisconnect = () => {
      ethWallets.forEach((w) => {
        onDisconnected(
          w.walletType,
          "Your wallet connection was interrupted. Please reconnect.",
        );
      });
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("disconnect", handleDisconnect);

    return () => {
      provider.removeListener("accountsChanged", handleAccountsChanged);
      provider.removeListener("disconnect", handleDisconnect);
    };
  }, [connectedWallets, onDisconnected, enabled]);
};

/**
 * Main hook — composes the Stellar and Ethereum guards.
 */
export const useWalletSessionGuard = ({
  connectedWallets,
  onDisconnected,
  pollInterval = DEFAULT_POLL_INTERVAL,
  enabled = true,
}: WalletSessionGuardOptions): void => {
  // Stable callback reference so inner effects don't re-run on every render.
  const onDisconnectedRef = useRef(onDisconnected);
  useEffect(() => {
    onDisconnectedRef.current = onDisconnected;
  });

  const stableOnDisconnected = useCallback(
    (walletType: WalletType, reason: string) => {
      onDisconnectedRef.current(walletType, reason);
    },
    [],
  );

  useStellarSessionGuard(
    connectedWallets,
    stableOnDisconnected,
    pollInterval,
    enabled,
  );
  useEthereumSessionGuard(connectedWallets, stableOnDisconnected, enabled);
};
