/**
 * useAccountSwitcher
 *
 * Provides an "switch account" affordance that re-requests the active account
 * from the wallet extension without a full disconnect/reconnect cycle.
 *
 * Supported wallets:
 *  - Freighter / other Stellar wallets via stellar-wallets-kit:
 *      Calls kit.getAddress() after the user has switched accounts in the
 *      extension.  Since Freighter does not emit an event when the active
 *      account changes, we re-query on demand.
 *  - MetaMask / EIP-1193 providers:
 *      Calls eth_requestAccounts which prompts the MetaMask account picker.
 *      Also listens for the 'accountsChanged' event to detect background
 *      switches.
 *
 * The hook does NOT disconnect and reconnect — it only refreshes the address.
 * If the wallet returns a different address the caller receives the updated
 * WalletInfo so it can update global state and re-run any balance fetches.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { kit } from "../constants/wallet-kit.constant";
import { WalletInfo, WalletType } from "../types/wallet.types";

export interface AccountSwitcherOptions {
  /** The currently selected wallet to switch accounts on. */
  selectedWallet: WalletInfo | undefined;
  /**
   * Called when a new account address is detected.
   * The caller should update global state (e.g. useGlobalAuthenticationStore)
   * with the new address.
   */
  onAccountChanged: (updatedWallet: WalletInfo) => void;
}

export interface AccountSwitcherResult {
  /** True while the account refresh is in progress. */
  isSwitching: boolean;
  /** Error message if the switch failed, null otherwise. */
  switchError: string | null;
  /**
   * Re-request the active account from the wallet extension.
   * For Stellar wallets: queries kit.getAddress().
   * For Ethereum/MetaMask: triggers eth_requestAccounts (opens account picker).
   */
  requestAccountSwitch: () => Promise<void>;
  /** Clear the switchError state. */
  clearError: () => void;
}

const STELLAR_WALLET_TYPES: WalletType[] = ["freighter", "albedo", "lobstr"];

export const useAccountSwitcher = ({
  selectedWallet,
  onAccountChanged,
}: AccountSwitcherOptions): AccountSwitcherResult => {
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Stable reference to the callback so event listeners don't need to re-bind.
  const onAccountChangedRef = useRef(onAccountChanged);
  useEffect(() => {
    onAccountChangedRef.current = onAccountChanged;
  });

  // -----------------------------------------------------------------------
  // Ethereum: listen for background account changes (e.g. user switches
  // inside MetaMask without clicking "Switch Account" in TrueStub).
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedWallet) return;
    const isEthWallet =
      selectedWallet.chain === "ethereum" || selectedWallet.chain === "bsc";
    if (!isEthWallet) return;

    const provider = (window as any).ethereum;
    if (!provider) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) return; // Handled by session guard (#93)
      const newAddress = accounts[0];
      if (newAddress === selectedWallet.address) return; // No change

      const updatedWallet: WalletInfo = {
        ...selectedWallet,
        address: newAddress,
      };
      onAccountChangedRef.current(updatedWallet);
    };

    provider.on("accountsChanged", handleAccountsChanged);
    return () => provider.removeListener("accountsChanged", handleAccountsChanged);
  }, [selectedWallet]);

  // -----------------------------------------------------------------------
  // requestAccountSwitch — callable from UI
  // -----------------------------------------------------------------------
  const requestAccountSwitch = useCallback(async () => {
    if (!selectedWallet) {
      setSwitchError("No wallet is currently connected.");
      return;
    }

    setIsSwitching(true);
    setSwitchError(null);

    try {
      // --- Stellar wallets ---
      if (STELLAR_WALLET_TYPES.includes(selectedWallet.walletType)) {
        // Re-query the wallet kit for the current address.  If the user has
        // switched to a different account in the extension, this will return
        // the new address.  If not, the address will be the same (no-op).
        if (!kit) {
          throw new Error(
            "Stellar wallet kit is not initialised (server-side render?)."
          );
        }
        const { address } = await kit.getAddress();
        if (!address) {
          throw new Error(
            "Your Stellar wallet returned no address. Make sure it is unlocked and connected."
          );
        }

        if (address !== selectedWallet.address) {
          const updatedWallet: WalletInfo = {
            ...selectedWallet,
            address,
            // publicKey mirrors address for Stellar wallets.
            ...("publicKey" in selectedWallet ? { publicKey: address } : {}),
          };
          onAccountChangedRef.current(updatedWallet);
        }
        return;
      }

      // --- MetaMask / EIP-1193 ---
      if (
        selectedWallet.walletType === "metamask" ||
        selectedWallet.walletType === "walletconnect"
      ) {
        const provider = (window as any).ethereum;
        if (!provider) {
          throw new Error(
            "No Ethereum provider found. Is MetaMask installed?"
          );
        }
        // eth_requestAccounts opens the MetaMask account picker if multiple
        // accounts are available, letting the user choose one explicitly.
        const accounts: string[] = await provider.request({
          method: "eth_requestAccounts",
        });
        if (!accounts.length) {
          throw new Error("No accounts returned from wallet.");
        }
        const newAddress = accounts[0];
        if (newAddress !== selectedWallet.address) {
          const updatedWallet: WalletInfo = {
            ...selectedWallet,
            address: newAddress,
          };
          onAccountChangedRef.current(updatedWallet);
        }
        return;
      }

      throw new Error(
        `Account switching is not supported for wallet type "${selectedWallet.walletType}".`
      );
    } catch (err: any) {
      setSwitchError(
        err?.message || "Failed to switch account. Please try again."
      );
    } finally {
      setIsSwitching(false);
    }
  }, [selectedWallet]);

  const clearError = useCallback(() => setSwitchError(null), []);

  return { isSwitching, switchError, requestAccountSwitch, clearError };
};
