"use client";

import { ApolloClientProvider } from "@/providers/ApolloProviderWrapper";
import { AuthTokenRefreshProvider } from "@/providers/AuthTokenRefreshProvider";
import { QueryProvider } from "@/providers/QueryProvider";
import { TrustlessWorkProvider } from "@/providers/TrustlessWorkProvider";
import { WalletProvider } from "@/components/tw-blocks/wallet-kit/WalletProvider";
import "@/i18n/config";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthTokenRefreshProvider>
      <ApolloClientProvider>
        <QueryProvider>
          <WalletProvider>
            <TrustlessWorkProvider>
              {children}
            </TrustlessWorkProvider>
          </WalletProvider>
        </QueryProvider>
      </ApolloClientProvider>
    </AuthTokenRefreshProvider>
  );
}