"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWalletDetection } from "./hooks/useWalletDetection";
import { useMultiWallet } from "./hooks/useMultiWallet";
import { useWalletSessionGuard } from "./hooks/useWalletSessionGuard";
import WalletOption from "./WalletOption";
import ConnectionStatus from "./ConnectionStatus";
import WalletReconnectPrompt from "./WalletReconnectPrompt";
import {
  STELLAR_WALLETS,
  ETHEREUM_WALLETS,
  POPULAR_WALLETS,
} from "./utils/walletConfig";
import { WalletType } from "./types/wallet.types";
import { useWalletPersistence } from "./hooks/useWalletPersistence";

interface WalletConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWalletConnected?: (walletInfo: any) => void;
}

/**
 * Derive the initial tab from a persisted wallet type so returning users
 * land on the same category they last used.
 */
const deriveTabFromWalletType = (
  walletType: WalletType | null,
): "popular" | "stellar" | "ethereum" => {
  if (!walletType) return "popular";
  if (STELLAR_WALLETS.includes(walletType)) return "stellar";
  if (ETHEREUM_WALLETS.includes(walletType)) return "ethereum";
  return "popular";
};

export default function WalletConnectionModal({
  isOpen,
  onClose,
  onWalletConnected,
}: WalletConnectionModalProps) {
  const detection = useWalletDetection();
  const {
    connectedWallets,
    selectedWallet,
    isConnecting,
    error,
    connectWallet,
    disconnectWallet,
    selectWallet,
    updateWalletAddress,
    reset,
  } = useMultiWallet();

  const { lastWalletType, saveWalletType, clearWalletType } =
    useWalletPersistence();

  // Pre-select the tab the user last visited.  Initialised to "popular" until
  // the persistence hook hydrates from localStorage after mount.
  const [activeTab, setActiveTab] = useState<"popular" | "stellar" | "ethereum">(
    "popular",
  );

  // Once the hook hydrates, update the active tab to match the last selection.
  useEffect(() => {
    setActiveTab(deriveTabFromWalletType(lastWalletType));
  }, [lastWalletType]);

  useEffect(() => {
    if (selectedWallet && onWalletConnected) {
      onWalletConnected(selectedWallet);
    }
  }, [selectedWallet, onWalletConnected]);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleConnect = async (walletType: WalletType) => {
    try {
      // If the user is reconnecting after a session loss, clear the prompt.
      setDisconnectedWallet(null);
      await connectWallet(walletType);
      // Persist the chosen wallet type so the modal pre-selects it next time.
      // Only the type identifier is stored — no keys or sensitive data.
      saveWalletType(walletType);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  };

  const handleDisconnect = async (walletType: WalletType) => {
    try {
      await disconnectWallet(walletType);
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
    }
  };

  const isWalletConnected = (walletType: WalletType) => {
    return connectedWallets.some((w) => w.walletType === walletType);
  };

  return (
    <>
      {/* Reconnect prompt — shown outside the modal so it is visible even when
          the modal is closed (e.g. the user is on an escrow creation form). */}
      {disconnectedWallet && (
        <WalletReconnectPrompt
          affectedWalletType={disconnectedWallet.walletType}
          reason={disconnectedWallet.reason}
          onReconnect={handleReconnect}
          onDismiss={handleDismissReconnect}
        />
      )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg" role="alert">
            <p className="text-red-800 dark:text-red-300 text-sm font-medium">{error.message}</p>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "popular" | "stellar" | "ethereum")} className="w-full">
          <TabsList className="grid w-full grid-cols-3" aria-label="Wallet categories">
            <TabsTrigger value="popular">Popular</TabsTrigger>
            <TabsTrigger value="stellar">Stellar</TabsTrigger>
            <TabsTrigger value="ethereum">Ethereum</TabsTrigger>
          </TabsList>

          <TabsContent value="popular" className="space-y-3 mt-4">
            <h3 className="font-medium text-sm mb-3 text-gray-700 dark:text-gray-300">Most Popular Wallets</h3>
            {POPULAR_WALLETS.map((walletType) => (
              <WalletOption
                key={walletType}
                walletType={walletType}
                isAvailable={detection[walletType]}
                isConnecting={isConnecting}
                isConnected={isWalletConnected(walletType)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
              />
            ))}
          </TabsContent>

          <TabsContent value="stellar" className="space-y-3 mt-4">
            <h3 className="font-medium text-sm mb-3 text-gray-700 dark:text-gray-300">Stellar Wallets</h3>
            {STELLAR_WALLETS.map((walletType) => (
              <WalletOption
                key={walletType}
                walletType={walletType}
                isAvailable={detection[walletType]}
                isConnecting={isConnecting}
                isConnected={isWalletConnected(walletType)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
              />
            ))}
          </TabsContent>

          <TabsContent value="ethereum" className="space-y-3 mt-4">
            <h3 className="font-medium text-sm mb-3 text-gray-700 dark:text-gray-300">Ethereum & BSC Wallets</h3>
            {ETHEREUM_WALLETS.map((walletType) => (
              <WalletOption
                key={walletType}
                walletType={walletType}
                isAvailable={detection[walletType]}
                isConnecting={isConnecting}
                isConnected={isWalletConnected(walletType)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
              />
            ))}
          </TabsContent>
        </Tabs>

        {connectedWallets.length > 0 && (
          <>
            <Separator className="my-6" />
            <ConnectionStatus
              connectedWallets={connectedWallets}
              selectedWallet={selectedWallet}
              onSelectWallet={selectWallet}
              onDisconnect={handleDisconnect}
              onAccountSwitched={updateWalletAddress}
            />
          </>
        )}

        <div className="mt-6 flex space-x-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          {connectedWallets.length > 0 && (
            <Button
              onClick={() => {
                onClose();
                if (selectedWallet && onWalletConnected) {
                  onWalletConnected(selectedWallet);
                }
              }}
              className="flex-1"
            >
              Continue
            </Button>
          )}
        </div>

        {connectedWallets.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              clearWalletType();
            }}
            className="w-full mt-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
          >
            Disconnect All
          </Button>
        )}

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            TrueStub supports multiple blockchain networks for secure P2P
            transactions
          </p>
        </div>
      )}
    </>
  );
}
