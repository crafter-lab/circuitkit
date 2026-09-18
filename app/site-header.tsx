"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiteLogo } from "./site-logo.tsx";
import { ThemeToggle } from "./theme-provider.tsx";

const navigation = [
  { href: "/editor?mode=circuitkit", label: "Playground" },
  { href: "/gallery", label: "Examples" },
  { href: "/docs", label: "Docs" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header page-grid">
      <Link
        className="wordmark"
        href="/"
        aria-label="CircuitKit home"
        aria-current={pathname === "/" ? "page" : undefined}
      >
        <SiteLogo />
      </Link>
      <a className="site-lab" href="https://crafter.run">
        By Crafter Lab
      </a>
      <nav className="site-nav" aria-label="Main navigation">
        {navigation.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={
              pathname === href.split("?")[0] || pathname?.startsWith(`${href.split("?")[0]}/`)
                ? "page"
                : undefined
            }
          >
            {label}
          </Link>
        ))}
        <a href="https://github.com/crafter-lab/circuitkit" aria-label="CircuitKit on GitHub">
          GitHub ↗
        </a>
        <ThemeToggle compact />
      </nav>
    </header>
  );
}
