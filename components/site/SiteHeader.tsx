"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/brand-build", label: "Brand build" },
  { href: "/asset-studio", label: "Asset building" },
  { href: "/contact", label: "Contact" },
];

/**
 * Floating pill nav — a rounded, shadowed capsule that sits on top of the page (frosted paper,
 * carbon type, in our light monochrome palette). Wordmark left + centred links, Sign in and a
 * filled "Book a demo" pill right; collapses to a hamburger on mobile. `floatReveal` (home intro)
 * keeps it hidden over the opening screen and fades it in once you scroll in.
 */
export function SiteHeader({ floatReveal = false }: { floatReveal?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [past, setPast] = useState(!floatReveal);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (v) => {
    if (floatReveal) setPast(v > (typeof window !== "undefined" ? window.innerHeight * 0.6 : 500));
  });

  useEffect(() => setOpen(false), [pathname]);

  const active = hovered ?? (NAV.find((n) => n.href === pathname)?.href || null);

  return (
    <motion.header
      initial={false}
      animate={{ opacity: past ? 1 : 0, y: past ? 0 : -14 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed inset-x-0 top-0 z-50 px-4 pt-4 md:pt-5 ${past ? "" : "pointer-events-none"}`}
    >
      <div className="relative mx-auto flex max-w-5xl items-center justify-between rounded-full border border-linen bg-paper/80 py-2.5 pl-6 pr-2.5 shadow-[0_18px_50px_-24px_rgba(25,25,23,0.28)] backdrop-blur-xl">
        {/* Left — wordmark */}
        <Link href="/" className="font-edito text-[21px] leading-none tracking-tight text-carbon transition-opacity duration-300 hover:opacity-60">
          tastebud
        </Link>

        {/* Centre — links, absolutely centred in the pill */}
        <nav
          className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 md:flex"
          onMouseLeave={() => setHovered(null)}
        >
          {NAV.map((n) => {
            const isActive = active === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                onMouseEnter={() => setHovered(n.href)}
                className="relative rounded-full px-3.5 py-2 text-[14.5px] transition-colors duration-300"
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    className="absolute inset-0 -z-10 rounded-full bg-carbon/[0.055]"
                  />
                )}
                <span className={isActive ? "text-carbon" : "text-clay hover:text-carbon"}>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right — sign in + book a demo */}
        <div className="flex items-center gap-2">
          <Link
            href="/signin"
            className="hidden rounded-full px-4 py-2 text-[14.5px] text-clay transition-colors duration-300 hover:text-carbon md:block"
          >
            Log in
          </Link>
          <Link
            href="/discovery/book"
            className="hidden rounded-full bg-carbon px-5 py-2.5 text-[14px] font-medium text-paper transition-colors duration-300 hover:bg-carbon/85 md:block"
          >
            Book a demo
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-10 w-10 flex-col items-center justify-center gap-[5px] rounded-full text-carbon md:hidden"
          >
            <span className={`h-px w-5 bg-current transition-transform duration-300 ${open ? "translate-y-[3px] rotate-45" : ""}`} />
            <span className={`h-px w-5 bg-current transition-transform duration-300 ${open ? "-translate-y-[3px] -rotate-45" : ""}`} />
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-2 max-w-5xl overflow-hidden rounded-3xl border border-linen bg-paper/95 p-2 shadow-[0_18px_50px_-24px_rgba(25,25,23,0.28)] backdrop-blur-xl md:hidden"
          >
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`block rounded-2xl px-4 py-3 text-[15px] ${pathname === n.href ? "bg-carbon/[0.05] text-carbon" : "text-clay"}`}
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-1 grid grid-cols-2 gap-2 p-1">
              <Link href="/signin" className="rounded-full border border-linen px-4 py-2.5 text-center text-[13px] font-medium uppercase tracking-[0.12em] text-carbon">
                Log in
              </Link>
              <Link href="/discovery/book" className="rounded-full bg-carbon px-4 py-2.5 text-center text-[13px] font-medium uppercase tracking-[0.12em] text-paper">
                Book a demo
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
