"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * Custom cursor — a small bone dot with a lagging ring that swells and turns to the
 * flame signature over anything interactive. Desktop / fine-pointer only; touch and
 * reduced-motion users keep the native cursor untouched.
 *
 * Interactive targets are matched by tag/role so we never have to tag every element.
 */
export function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const [hot, setHot] = useState(false);
  const [down, setDown] = useState(false);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 320, damping: 28, mass: 0.5 });
  const ringY = useSpring(y, { stiffness: 320, damping: 28, mass: 0.5 });

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;
    setEnabled(true);
    document.documentElement.classList.add("cursor-hidden");

    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const el = e.target as HTMLElement | null;
      setHot(!!el?.closest('a, button, [role="button"], input, textarea, select, label, summary, details'));
    };
    const dn = () => setDown(true);
    const up = () => setDown(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mousedown", dn);
    window.addEventListener("mouseup", up);
    return () => {
      document.documentElement.classList.remove("cursor-hidden");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mousedown", dn);
      window.removeEventListener("mouseup", up);
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <>
      {/* Precise dot — no lag. */}
      <motion.div
        aria-hidden
        style={{ x, y }}
        className="pointer-events-none fixed left-0 top-0 z-[100] -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full bg-bone mix-blend-difference"
      />
      {/* Lagging ring — swells + colours over interactive targets. */}
      <motion.div
        aria-hidden
        style={{ x: ringX, y: ringY }}
        animate={{
          width: hot ? 52 : 30,
          height: hot ? 52 : 30,
          marginLeft: hot ? -26 : -15,
          marginTop: hot ? -26 : -15,
          borderColor: hot ? "rgba(255,91,46,0.9)" : "rgba(245,242,234,0.5)",
          scale: down ? 0.82 : 1,
        }}
        transition={{ type: "spring", stiffness: 320, damping: 24 }}
        className="pointer-events-none fixed left-0 top-0 z-[100] rounded-full border"
      />
    </>
  );
}
