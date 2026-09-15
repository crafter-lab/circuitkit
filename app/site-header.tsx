"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-provider.tsx";

const navigation = [
  { href: "/editor", label: "Editor" },
  { href: "/gallery", label: "Gallery" },
  { href: "/lesson", label: "Lesson" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header page-grid">
      <Link className="wordmark" href="/" aria-current={pathname === "/" ? "page" : undefined}>
        CircuitKit
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
              pathname === href || pathname?.startsWith(`${href}/`) ? "page" : undefined
            }
          >
            {label}
          </Link>
        ))}
        <ThemeToggle />
      </nav>
    </header>
  );
}
