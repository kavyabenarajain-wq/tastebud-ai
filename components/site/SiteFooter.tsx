"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CTA, TextLink } from "./Button";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Brand build", href: "/brand-build" },
      { label: "Asset studio", href: "/asset-studio" },
      { label: "Pricing", href: "/asset-studio#pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact", href: "/contact" },
      { label: "Book a demo", href: "/discovery/book" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "FAQ", href: "/asset-studio#faq" },
      { label: "Privacy Policy", href: "#" },
      { label: "Acceptable Use", href: "#" },
    ],
  },
];

/**
 * Footer — light, monochrome, quiet. A real footer, not a second hero: wordmark + one-line
 * tagline + a single demo CTA on the left, link columns on the right, a hairline bottom bar.
 */
export function SiteFooter() {
  return (
    <>
      <footer className="border-t border-linen bg-cream text-carbon">
        <div className="mx-auto max-w-6xl px-6 pb-12 pt-20">
          <div className="flex flex-col gap-12 md:flex-row md:justify-between">
            <div className="max-w-xs">
              <span className="font-edito text-3xl tracking-tight">tastebud</span>
              <p className="mt-3 text-[15px] leading-relaxed text-clay">
                A studio with taste. Build the brand, then make the work.
              </p>
              <div className="mt-7">
                <CTA href="/discovery/book" variant="outline" size="md">Book a demo</CTA>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3">
              {COLUMNS.map((col) => (
                <div key={col.title}>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-clay">{col.title}</p>
                  <ul className="mt-4 space-y-2.5">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <TextLink href={l.href} className="text-[14px] text-clay hover:text-carbon">{l.label}</TextLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-16 flex flex-col items-start gap-3 border-t border-linen pt-7 text-[11px] uppercase tracking-[0.16em] text-clay md:flex-row md:items-center md:justify-between">
            <span>© 2026 tastebud — studio, not software</span>
            <Link href="/" className="transition-colors hover:text-carbon">tastebud.studio</Link>
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
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-5 rounded-2xl border border-linen bg-paper px-5 py-3.5 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.15)]">
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
