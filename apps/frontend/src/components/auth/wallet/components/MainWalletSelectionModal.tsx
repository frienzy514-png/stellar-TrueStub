"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X } from "lucide-react";
import WalletConnectURI from "./WalletConnectURI";

export type WalletType = "stellar" | "metamask" | "walletconnect";

interface MainWalletSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWalletTypeSelected: (walletType: WalletType) => void;
}

const walletOptions = [
  {
    id: "stellar" as WalletType,
    name: "Stellar",
    icon: "/img/wallet/stellar.png",
    description: "Freighter, Albedo, LOBSTR",
  },
  {
    id: "metamask" as WalletType,
    name: "MetaMask",
    icon: "/img/wallet/metamask.png",
    description: "Browser extension wallet",
  },
  {
    id: "walletconnect" as WalletType,
    name: "WalletConnect",
    icon: "/img/wallet/walletconnect.png",
    description: "300+ mobile & desktop wallets",
  },
];

export const MainWalletSelectionModal: React.FC<
  MainWalletSelectionModalProps
> = ({ isOpen, onClose, onWalletTypeSelected }) => {
  const [showWalletConnectModal, setShowWalletConnectModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (showWalletConnectModal) {
          setShowWalletConnectModal(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showWalletConnectModal, onClose]);

  if (!isOpen) return null;

  const handleWalletConnectClick = () => {
    setShowWalletConnectModal(true);
  };

  const closeWalletConnectModal = () => {
    setShowWalletConnectModal(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="main-wallet-modal-title"
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 id="main-wallet-modal-title" className="text-xl font-semibold text-gray-900 dark:text-white">
            Connect Wallet
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close wallet selection modal">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[calc(90vh-120px)] overflow-y-auto">
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Choose your preferred wallet
            </p>

            {walletOptions.map((option) => {
              const handleClick = () => {
                if (option.id === "walletconnect") {
                  handleWalletConnectClick();
                } else {
                  onWalletTypeSelected(option.id);
                }
              };

              const handleKeyDown = (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClick();
                }
              };

              return (
                <Card
                  key={option.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${option.name} wallet`}
                  className="cursor-pointer bg-transparent transition-all duration-200 hover:shadow-md hover:ring-2 hover:ring-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700"
                  onClick={handleClick}
                  onKeyDown={handleKeyDown}
                >
                  <CardContent className="!p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <img
                          src={option.icon}
                          alt=""
                          aria-hidden="true"
                          className="w-8 h-8 rounded-lg"
                          onError={(e) => {
                            e.currentTarget.src = "/img/logo.png";
                          }}
                        />
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{option.name}</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {option.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {showWalletConnectModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="walletconnect-modal-title"
        >
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 id="walletconnect-modal-title" className="text-xl font-semibold text-gray-900 dark:text-white">
                Connect WalletConnect
              </h2>
              <Button variant="ghost" size="sm" onClick={closeWalletConnectModal} aria-label="Close WalletConnect modal">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-6 space-y-4">
              <WalletConnectURI />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
