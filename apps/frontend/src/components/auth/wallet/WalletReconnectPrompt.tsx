"use client";

/**
 * WalletReconnectPrompt
 *
 * Shown when useWalletSessionGuard detects that a wallet has been locked or
 * disconnected mid-session. Gives the user a clear, friendly prompt with:
 *  - Which wallet was affected and why.
 *  - A "Reconnect" button that reopens the wallet connection modal.
 *  - A "Dismiss" button for users who want to continue in read-only mode.
 *
 * The component preserves no form state itself — it is the responsibility of
 * the parent page to keep draft escrow data in React state so it survives
 * the reconnect flow.
 */
import React from "react";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletType } from "./types/wallet.types";
import { getWalletConfig } from "./utils/walletConfig";

export interface WalletReconnectPromptProps {
  /** The wallet type whose session was lost. */
  affectedWalletType: WalletType;
  /** Human-readable explanation from the guard (e.g. "Your wallet was locked"). */
  reason: string;
  /** Called when the user clicks Reconnect — parent should re-open the connection modal. */
  onReconnect: () => void;
  /** Called when the user dismisses the prompt without reconnecting. */
  onDismiss: () => void;
}

export const WalletReconnectPrompt: React.FC<WalletReconnectPromptProps> = ({
  affectedWalletType,
  reason,
  onReconnect,
  onDismiss,
}) => {
  const config = getWalletConfig(affectedWalletType);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="reconnect-prompt-title"
      aria-describedby="reconnect-prompt-body"
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
    >
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-sm border border-gray-200 dark:border-gray-800 p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40"
              aria-hidden="true"
            >
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2
                id="reconnect-prompt-title"
                className="text-base font-semibold text-gray-900 dark:text-white"
              >
                Wallet disconnected
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1 mt-0.5">
                <span aria-hidden="true">{config.icon}</span>
                <span>{config.name}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss reconnect prompt"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <p
          id="reconnect-prompt-body"
          className="text-sm text-gray-700 dark:text-gray-300 mb-6 leading-relaxed"
        >
          {reason}
        </p>

        {/* Note about preserved state */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Any in-progress form data has been preserved — reconnecting will let
          you pick up where you left off.
        </p>

        {/* Actions */}
        <div className="flex space-x-3">
          <Button
            onClick={onReconnect}
            className="flex-1"
            aria-label={`Reconnect ${config.name} wallet`}
          >
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            Reconnect
          </Button>
          <Button variant="outline" onClick={onDismiss} className="flex-1">
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WalletReconnectPrompt;
