import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { TrustlessWorkProvider } from "@/providers/TrustlessWorkProvider";
import { Toaster } from "@/components/ui/sonner"

// @ts-ignore: allow side-effect import of global css
import "./globals.css";

import { ClientProviders } from "@/providers/ClientProviders";
import { ThemeProvider } from "next-themes";
import { GraphQLDebugger } from "@/components/dev/GraphQLDebugger";
import {
  BRAND_THEME_COLOR,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/metadata/site";

const inter = Inter({ subsets: ["latin"] });

// Icons come from the App Router file conventions (favicon.ico, icon.tsx,
// apple-icon.tsx) and the manifest from manifest.ts — Issues #170, #171.
// The default Open Graph / Twitter image comes from opengraph-image.tsx
// — Issue #173.
export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: BRAND_THEME_COLOR,
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