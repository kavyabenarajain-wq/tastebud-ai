"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Package, UserRound } from "lucide-react";
import { Wordmark } from "@/components/tastebud/Wordmark";
import { BackLink } from "@/components/tastebud/BackLink";
import type { BrandBrain } from "@/lib/types";

/**
 * PAGE 7 — What are you looking for?
 * Two options (v1): Product | Model. The brand brain from Page 6 is already loaded
 * behind the scenes (shown as a small chip), so this feels like a continuation.
 * Room to add more later (campaigns, ads).
 */
const PATHS = [
  { href: "/studio/product", title: "Product Photoshoot", sub: "Packshots, hero, lifestyle, flat-lays — your product, shot on-brand.", Icon: Package },
  { href: "/studio/model", title: "Model Photoshoot", sub: "Your product on a model you build or paste in — held consistent across the set.", Icon: UserRound },
];

export default function StudioChoose() {
  const router = useRouter();
  const [brand, setBrand] = useState<BrandBrain | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cc.activeBrand");
      if (raw) {
        const b = JSON.parse(raw) as BrandBrain;
        if (b?.name) {
          setBrand(b);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    // No brand learned yet — send them through Page 6 first.
    router.replace("/studio");
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-5">
          <BackLink href="/studio" />
          <Wordmark size="sm" href="/" />
        </div>
        {brand?.name && (
          <span className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-ink" />
            {brand.name}
          </span>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 pb-24">
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="mb-10 text-center font-serif text-3xl font-light tracking-tight text-ink md:text-4xl"
        >
          What are you looking for?
        </motion.h1>

        <div className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline md:grid-cols-2">
          {PATHS.map((p, i) => (
            <motion.div
              key={p.href}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 + i * 0.08, ease: [0.4, 0, 0.2, 1] }}
            >
              <Link
                href={p.href}
                className="group flex h-full min-h-[38vh] flex-col justify-between bg-canvas p-9 transition-colors duration-300 ease-brand hover:bg-surface md:p-11"
              >
                <p.Icon size={22} strokeWidth={1.4} className="text-muted" />
                <div>
                  <h2 className="font-serif text-3xl font-light tracking-tight text-ink">{p.title}</h2>
                  <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-muted">{p.sub}</p>
                  <span className="mt-5 inline-block text-sm text-ink opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    Open →
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </main>
  );
}
