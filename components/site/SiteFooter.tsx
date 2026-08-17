"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CTA, TextLink } from "./Button";
import { ThemeToggle } from "./theme";

const COLUMNS: { title: string; links: { label: string; href: string; soon?: boolean }[] }[] = [
  {
    title: "Explore",
    links: [
      { label: "Home", href: "/" },
      { label: "Brand Discovery", href: "/brand-discovery" },
      { label: "Asset Studio", href: "/asset-studio", soon: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Book a call", href: "/discovery/book" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Acceptable Use", href: "#" },
    ],
  },
];

/**
 * Footer — light/dark, monochrome, quiet. A real footer, not a second hero: wordmark + one-line
 * tagline + a demo CTA + theme toggle on the left, link columns on the right, a hairline bottom bar.
 */
export function SiteFooter() {
  return (
    <>
      <footer className="border-t border-linen bg-cream text-carbon">
        <div className="mx-auto max-w-6xl px-6 pb-12 pt-20">
          <div className="flex flex-col gap-12 md:flex-row md:justify-between">
            <div className="max-w-xs">
              <span className="font-edito text-3xl tracking-tight text-accent">tastebud</span>
              <p className="mt-3 text-[15px] leading-relaxed text-clay">
                A studio with taste. Build the brand, then make the work.
              </p>
              <div className="mt-7 flex items-center gap-3">
                <CTA href="/discovery/book" variant="outline" size="md">Book a demo</CTA>
                <ThemeToggle />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3">
              {COLUMNS.map((col) => (
                <div key={col.title}>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-clay">{col.title}</p>
                  <ul className="mt-4 space-y-2.5">
                    {col.links.map((l) => (
                      <li key={l.label} className="flex items-center gap-2">
                        <TextLink href={l.href} className="text-[14px] text-clay hover:text-carbon">{l.label}</TextLink>
                        {l.soon && (
                          <span className="rounded-full border border-linen px-1.5 py-0.5 text-[8.5px] font-medium uppercase tracking-[0.14em] text-clay">
                            Soon
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-16 flex flex-col items-start gap-3 border-t border-linen pt-7 text-[11px] uppercase tracking-[0.16em] text-clay md:flex-row md:items-center md:justify-between">
            <span>© 2026 tastebud — studio, not software</span>
            <Link href="/" className="transition-colors hover:text-carbon">aitastebud.com</Link>
          </div>
        </div>
      </footer>

      <CookieNotice />
    </>
  );
}

function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("tb.cookies")) setShow(true);
    } catch {}
  }, []);
  if (!show) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-5 rounded-2xl border border-linen bg-paper px-5 py-3.5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]">
      <span className="text-[13px] text-clay">This site uses cookies.</span>
      <button
        onClick={() => {
          try {
            localStorage.setItem("tb.cookies", "1");
          } catch {}
          setShow(false);
        }}
        className="text-[13px] font-medium text-carbon underline underline-offset-4"
      >
        Accept
      </button>
    </div>
  );
}
