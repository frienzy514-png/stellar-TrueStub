"use client";

import { Button } from "@/components/ui/button";
import { WalletType } from "./types/wallet.types";
import { getWalletConfig } from "./utils/walletConfig";
import { isWalletAvailable } from "./hooks/useWalletDetection";

interface WalletOptionProps {
  walletType: WalletType;
  isAvailable: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  onConnect: (walletType: WalletType) => void;
  onDisconnect: (walletType: WalletType) => void;
}

export default function WalletOption({
  walletType,
  isAvailable,
  isConnecting,
  isConnected,
  onConnect,
  onDisconnect,
}: WalletOptionProps) {
  const config = getWalletConfig(walletType);

  const handleClick = () => {
    if (isConnected) {
      onDisconnect(walletType);
    } else {
      onConnect(walletType);
    }
  };

  const getButtonText = () => {
    if (isConnecting) return "Connecting...";
    if (isConnected) return "Disconnect";
    if (!isAvailable) return "Install Wallet";
    return "Connect";
  };

  const getButtonVariant = () => {
    if (isConnected) return "destructive";
    if (!isAvailable) return "outline";
    return "default";
  };

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700 transition-colors">
      <div className="flex items-center space-x-3">
        <div className="text-2xl" role="img" aria-label={`${config.name} icon`}>
          {config.icon}
        </div>
        <div>
          <h3 className="font-medium text-sm text-gray-900 dark:text-white">{config.name}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {config.description}
          </p>
          {!isAvailable && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
              Not installed
            </p>
          )}
          {isConnected && (
            <p className="text-xs font-medium text-green-700 dark:text-green-400">
              Connected
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {!isAvailable && config.downloadUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(config.downloadUrl, "_blank")}
            aria-label={`Install ${config.name} extension`}
            className="text-xs"
          >
            Install
          </Button>
        )}

        <Button
          variant={getButtonVariant()}
          size="sm"
          onClick={handleClick}
          disabled={isConnecting || (!isAvailable && !config.downloadUrl)}
          aria-label={`${getButtonText()} ${config.name}`}
          className="min-w-[80px] text-xs"
        >
          {getButtonText()}
        </Button>
      </div>
    </div>
  );
}
