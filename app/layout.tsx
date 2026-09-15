import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
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
  title: "CircuitKit | Circuit diagrams that explain themselves",
  description:
    "Explain electrical nodes with interactive circuit figures. One versioned document for portable SVG, React lessons, and a local CLI.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
