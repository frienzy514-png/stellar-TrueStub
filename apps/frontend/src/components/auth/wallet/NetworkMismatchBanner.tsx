"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useTranslation } from "react-i18next";

interface NetworkMismatchBannerProps {
  /** The network passphrase currently active in the wallet. */
  actualNetwork: string;
  /** The network passphrase the app expects. */
  expectedNetwork: string;
  /** Additional class names for the wrapping element. */
  className?: string;
}

/**
 * Displays a destructive alert banner when the connected wallet's network
 * does not match the app's configured network.
 *
 * Render this component only when a mismatch is detected:
 *
 * ```tsx
 * {!isNetworkMatch && actualNetwork && (
 *   <NetworkMismatchBanner
 *     actualNetwork={actualNetwork}
 *     expectedNetwork={expectedNetwork}
 *   />
 * )}
 * ```
 */
export function NetworkMismatchBanner({
  actualNetwork,
  expectedNetwork,
  className,
}: NetworkMismatchBannerProps) {
  const { t } = useTranslation("translations");

  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t("wallet.networkMismatch.title")}</AlertTitle>
      <AlertDescription>
        {t("wallet.networkMismatch.description", {
          actual: actualNetwork,
          expected: expectedNetwork,
        })}
      </AlertDescription>
    </Alert>
  );
}

export default NetworkMismatchBanner;
