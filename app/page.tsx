"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { motion } from "framer-motion";

/**
 * PAGE 1 — Landing.
 * The word "tastebud" alone on a clean field. The whole screen is the click target.
 * A held breath; the most minimal screen in the product.
 */
export default function Landing() {
  const router = useRouter();
  const enter = () => router.push("/signin");

  useEffect(() => {
    router.prefetch("/signin");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") enter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main
      onClick={enter}
      role="button"
      tabIndex={0}
      aria-label="Enter tastebud"
      className="flex h-screen w-screen cursor-pointer select-none flex-col items-center justify-center bg-canvas"
    >
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
        className="font-serif text-[18vw] font-light leading-none tracking-tight text-ink md:text-[13vw]"
      >
        tastebud
      </motion.h1>

      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0.25, 0.5] }}
        transition={{ delay: 1, duration: 4, repeat: Infinity, repeatType: "reverse" }}
        className="mt-10 text-[11px] uppercase tracking-wide text-muted"
      >
        press to enter
      </motion.span>
    </main>
  );
}
