import { useState, useEffect, useCallback } from "react";
import { WalletNetwork } from "@creit.tech/stellar-wallets-kit";
import { kit } from "../constants/wallet-kit.constant";

/**
 * Maps the NEXT_PUBLIC_TRUSTLESS_NETWORK env value to its full Stellar
 * network passphrase so we can compare it against the value returned
 * by `kit.getNetwork()`.
 *
 * Note: The Stellar Wallets Kit uses `WalletNetwork.PUBLIC` for mainnet
 * (passphrase: "Public Global Stellar Network ; September 2015").
 */
function resolveExpectedNetwork(env: string): string {
  if (env === "mainnet") {
    return WalletNetwork.PUBLIC;
  }
  return WalletNetwork.TESTNET;
}

export interface NetworkCheckResult {
  /** True when the wallet's active network matches the app's expected network. */
  isNetworkMatch: boolean;
  /** The network passphrase the app is configured for. */
  expectedNetwork: string;
  /** The network passphrase currently reported by the connected wallet. */
  actualNetwork: string;
  /** True while the async `getNetwork()` call is in-flight. */
  isChecking: boolean;
}

/**
 * Hook that checks whether the connected Stellar wallet is on the same
 * network as the app (driven by NEXT_PUBLIC_TRUSTLESS_NETWORK).
 *
 * @param isConnected - Pass `true` once a Stellar wallet is connected so the
 *   hook knows when to start checking.
 */
export function useNetworkCheck(isConnected: boolean): NetworkCheckResult {
  const networkEnv =
    (process.env.NEXT_PUBLIC_TRUSTLESS_NETWORK as "testnet" | "mainnet") ||
    "testnet";

  const expectedNetwork = resolveExpectedNetwork(networkEnv);

  const [actualNetwork, setActualNetwork] = useState<string>("");
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const checkNetwork = useCallback(async () => {
    // Guard: kit is null during SSR or when the browser hasn't loaded it yet.
    if (!kit) return;

    setIsChecking(true);
    try {
      const result = await kit.getNetwork();
      setActualNetwork(result.network);
    } catch {
      // If we can't determine the network, leave actualNetwork empty.
      setActualNetwork("");
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected) {
      checkNetwork();
    } else {
      // Reset when the wallet disconnects.
      setActualNetwork("");
    }
  }, [isConnected, checkNetwork]);

  const isNetworkMatch =
    !isChecking && actualNetwork !== "" && actualNetwork === expectedNetwork;

  return {
    isNetworkMatch,
    expectedNetwork,
    actualNetwork,
    isChecking,
  };
}
