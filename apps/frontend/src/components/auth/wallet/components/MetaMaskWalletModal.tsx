"use client";

import React, { useState, useEffect } from "react";

// ethers is only needed when the user clicks "Connect MetaMask", so we
// load it lazily to keep it out of the initial page bundle.
async function getEthers() {
  const { ethers } = await import("ethers");
  return ethers;
}
import { Button } from "@/components/ui/button";
import { 
  X, 
  AlertTriangle, 
  ExternalLink,
  RefreshCw
} from "lucide-react";

interface MetaMaskWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWalletConnected: (walletData: any) => void;
}

export const MetaMaskWalletModal: React.FC<MetaMaskWalletModalProps> = ({
  isOpen,
  onClose,
  onWalletConnected
}) => {
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if MetaMask is installed
  useEffect(() => {
    if (isOpen) {
      const checkMetaMask = () => {
        if (typeof window !== "undefined") {
          const isInstalled = !!window.ethereum;
          setIsMetaMaskInstalled(isInstalled);
        } else {
          setIsMetaMaskInstalled(false);
        }
      };
      
      checkMetaMask();
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const connectMetaMask = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      if (window.ethereum == null) {
        throw new Error("MetaMask is not installed");
      }

      // Dynamic import — only fetched when the user clicks Connect
      const ethers = await getEthers();

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Get account details
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const balance = await provider.getBalance(address);

      const walletData = {
        address,
        network: network.name,
        balance: ethers.formatEther(balance),
        provider: window.ethereum
      };

      onWalletConnected(walletData);
    } catch (error: any) {
      setError(error.message || "Failed to connect to MetaMask");
    } finally {
      setIsConnecting(false);
    }
  };

  const installMetaMask = () => {
    window.open("https://metamask.io/download/", "_blank");
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="metamask-modal-title"
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 id="metamask-modal-title" className="text-xl font-semibold text-gray-900 dark:text-white">
            {!isMetaMaskInstalled ? "Install MetaMask" : "Connect MetaMask"}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close MetaMask connection modal">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[calc(90vh-120px)] overflow-y-auto">
          {!isMetaMaskInstalled ? (
            /* MetaMask Not Installed */
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <img 
                  src="/img/wallet/metamask.png" 
                  alt=""
                  aria-hidden="true"
                  className="w-16 h-16 rounded-lg"
                />
              </div>
              
              <div>
                <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">MetaMask Not Found</h3>
                <p className="text-gray-600 dark:text-gray-400">Install MetaMask to connect your wallet</p>
              </div>

              <div className="flex space-x-3">
                <Button 
                  onClick={installMetaMask}
                  className="flex-1"
                  size="lg"
                >
                  <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                  Install MetaMask
                </Button>
                <Button 
                  variant="outline" 
                  onClick={onClose}
                  size="lg"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            /* MetaMask Installed - Troubleshooting */
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <img 
                  src="/img/wallet/metamask.png" 
                  alt=""
                  aria-hidden="true"
                  className="w-16 h-16 rounded-lg"
                />
              </div>
              
              <div>
                <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">MetaMask Detected</h3>
                <p className="text-gray-600 dark:text-gray-400">Click below to connect your wallet</p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg" role="alert">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                  </div>
                </div>
              )}

              <div className="flex space-x-3">
                <Button 
                  onClick={connectMetaMask}
                  disabled={isConnecting}
                  className="flex-1"
                  size="lg"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      Connecting...
                    </>
                  ) : (
                    "Connect MetaMask"
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={onClose}
                  size="lg"
                >
                  Cancel
                </Button>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
