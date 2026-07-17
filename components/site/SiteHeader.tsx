"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/brand-build", label: "Brand build" },
  { href: "/asset-studio", label: "Asset building" },
  { href: "/contact", label: "Contact" },
];

/** Floating pill nav (brand.ai structure, tastebud palette). Fixed; pages pad for it. */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
      <div className="mx-auto max-w-5xl rounded-3xl border border-linen bg-paper/85 shadow-[0_1px_2px_rgba(25,25,23,0.05)] backdrop-blur-md md:rounded-full">
        <div className="flex items-center justify-between py-2.5 pl-5 pr-2.5">
          <Link href="/" className="flex items-center gap-2.5 text-ink transition-opacity duration-300 hover:opacity-70">
            <span className="font-site-serif text-lg tracking-tight">tastebud</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-full px-3.5 py-1.5 text-[14px] transition-colors duration-300 ${
                    active ? "bg-cream text-ink" : "text-clay hover:text-ink"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5">
            <Link
              href="/signin"
              className="hidden px-3 py-1.5 text-[14px] text-clay transition-colors duration-300 hover:text-ink md:block"
            >
              Sign in
            </Link>
            <Link
              href="/discovery/book"
              className="rounded-full bg-carbon px-4 py-2 text-[14px] font-medium text-cream transition-opacity duration-300 hover:opacity-85"
            >
              Book a demo
            </Link>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] rounded-full text-ink md:hidden"
            >
              <span className={`h-px w-4 bg-current transition-transform duration-300 ${open ? "translate-y-[3px] rotate-45" : ""}`} />
              <span className={`h-px w-4 bg-current transition-transform duration-300 ${open ? "-translate-y-[3px] -rotate-45" : ""}`} />
            </button>
          </div>
        </div>

        {open && (
          <nav className="flex flex-col gap-1 border-t border-linen px-4 py-3 md:hidden">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`rounded-2xl px-3.5 py-2.5 text-[15px] ${
                  pathname === n.href ? "bg-cream text-ink" : "text-clay"
                }`}
              >
                {n.label}
              </Link>
            ))}
            <Link href="/signin" onClick={() => setOpen(false)} className="rounded-2xl px-3.5 py-2.5 text-[15px] text-clay">
              Sign in
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
