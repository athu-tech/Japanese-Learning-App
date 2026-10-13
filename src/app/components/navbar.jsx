"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { name: "Dashboard", href: "/dashboard", icon: "⌂" },
  { name: "Review", href: "/review", icon: "↻" },
  { name: "Vocabulary", href: "/vocabulary", icon: "あ" },
  { name: "Grammar", href: "/grammar", icon: "文" },
  { name: "Kanji", href: "/kanji", icon: "漢" },
  { name: "Assessment", href: "/assessment", icon: "✓" },
  { name: "Roadmap", href: "/roadmap", icon: "≡" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <Link href="/dashboard" className="app-nav-brand">
        <span className="app-nav-mark" aria-hidden="true">日</span>
        <span>
          <span className="app-nav-title">日本語 Study</span>
          <span className="app-nav-caption">Learn · practice · progress</span>
        </span>
      </Link>

      <div className="app-nav-links">
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className="app-nav-link"
            >
              <span className="app-nav-icon" aria-hidden="true">{link.icon}</span>
              {link.name}
            </Link>
          );
        })}
      </div>

      <div className="app-nav-footer">
        <strong>Japanese Learning App</strong>
        A steady path, one session at a time.
      </div>
    </nav>
  );
}
