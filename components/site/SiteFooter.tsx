"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
  {
    title: "Social",
    links: [
      { label: "Instagram", href: "#" },
      { label: "LinkedIn", href: "#" },
    ],
  },
];

/**
 * Site footer (brand.ai structure, tastebud palette): the work strip on cream,
 * then the dark slab — big mark, one serif line, demo CTA, link columns,
 * copyright + our site + status pill. Cookie notice rides along.
 */
export function SiteFooter() {
  return (
    <>
      <footer className="bg-carbon text-cream">
        <div className="mx-auto flex max-w-content flex-col items-center px-6 pb-16 pt-24">
          <p className="text-center font-site-serif text-4xl font-light tracking-tight md:text-6xl">
            A studio with taste.
          </p>
          <Link
            href="/discovery/book"
            className="mt-10 rounded-xl border border-cream/25 px-6 py-3 text-[15px] transition-colors duration-300 hover:bg-cream hover:text-carbon"
          >
            Book a demo
          </Link>

          <div className="mt-24 grid w-full grid-cols-2 gap-10 md:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="text-[14px] font-medium text-cream">{col.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        href={l.href}
                        className="text-[14px] text-cream/60 transition-colors duration-300 hover:text-cream"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-20 flex w-full flex-col items-start gap-5 border-t border-cream/10 pt-8 md:flex-row md:items-center md:justify-between">
            <p className="text-[13px] text-cream/60">© 2026 tastebud</p>
            <Link
              href="/"
              className="text-[13px] text-cream/60 transition-colors duration-300 hover:text-cream"
            >
              tastebud.studio
            </Link>
            <span className="flex items-center gap-2 rounded-full bg-cream/10 px-3.5 py-1.5 text-[13px] text-cream/80">
              <span className="h-1.5 w-1.5 rounded-full bg-[#61A374]" />
              Operational
            </span>
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
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-5 rounded-2xl border border-linen bg-paper px-5 py-3.5 shadow-card">
      <span className="text-[13px] text-clay">This site uses cookies.</span>
      <button
        onClick={() => {
          try {
            localStorage.setItem("tb.cookies", "1");
          } catch {}
          setShow(false);
        }}
        className="text-[13px] font-medium text-ink underline underline-offset-4"
      >
        Accept
      </button>
    </div>
  );
}
