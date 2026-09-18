import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer.tsx";
import { SiteHeader } from "./site-header.tsx";
import { AppThemeProvider } from "./theme-provider.tsx";
import "./globals.css";

const geist = localFont({
  src: "../fonts/Geist-Regular.ttf",
  variable: "--font-geist",
  display: "swap",
});
const geistMono = localFont({
  src: "../fonts/GeistMono-Regular.ttf",
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://circuitkit.crafter.ing"),
  title: "CircuitKit | Circuit diagrams for coding agents",
  description:
    "Give your coding agent a circuit skill. Write explicit connections, preview blocks, wiring or schematics, and export real SVG/PNG locally.",
  alternates: { canonical: "/", types: { "text/markdown": "/index.md" } },
  applicationName: "CircuitKit",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "CircuitKit",
    title: "CircuitKit | Circuit diagrams for coding agents",
    description: "Describe the modules and connections. Export blocks, wiring or schematics as SVG or PNG.",
    images: [
      {
        url: "/brand-assets/og-dark.png",
        width: 1200,
        height: 630,
        alt: "CircuitKit. Circuit diagrams for coding agents.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CircuitKit | Circuit diagrams for coding agents",
    description: "Describe the modules and connections. Export blocks, wiring or schematics as SVG or PNG.",
    images: ["/brand-assets/og-dark.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/brand-assets/favicon.svg", sizes: "any", type: "image/svg+xml" },
      { url: "/brand-assets/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/brand-assets/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/brand-assets/site.webmanifest",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <AppThemeProvider>
          <div className="app-shell">
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <SiteHeader />
            <div className="app-content">{children}</div>
            <SiteFooter />
          </div>
        </AppThemeProvider>
      </body>
    </html>
  );
}
