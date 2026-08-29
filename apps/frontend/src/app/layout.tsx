import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TrustlessWorkProvider } from "@/providers/TrustlessWorkProvider";
import { Toaster } from "@/components/ui/sonner"

// @ts-ignore: allow side-effect import of global css
import "./globals.css";

import { ClientProviders } from "@/providers/ClientProviders";
import { ThemeProvider } from "next-themes";
import { GraphQLDebugger } from "@/components/dev/GraphQLDebugger";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TrueStub",
  description:
    "Trustless escrow for peer-to-peer ticket resale, built on the Stellar blockchain.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ClientProviders>
            <TrustlessWorkProvider>
              {children}
              <Toaster richColors position="top-right" />
              {process.env.NODE_ENV === 'development' && <GraphQLDebugger />}
            </TrustlessWorkProvider>
          </ClientProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}