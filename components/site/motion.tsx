"use client";

/**
 * Motion primitives for the marketing site.
 *
 * One small, reusable toolkit so every page moves with the same physics:
 *   Reveal / Stagger — scroll-triggered fade+rise+blur (respects reduced-motion)
 *   Words           — headline that assembles word-by-word behind a mask
 *   Parallax        — scroll-linked layer drift
 *   Counter         — number that counts up when it enters view
 *   Marquee         — infinite horizontal strip (CSS-driven, GPU-cheap)
 *   ScrollProgress  — the hairline read-out at the very top of the page
 *   Tilt            — pointer-reactive 3D card
 *   Magnetic        — element that leans toward the cursor
 *   AuroraField     — the drifting iridescent light behind dark sections
 *
 * Everything degrades to "just appear, don't move" under prefers-reduced-motion.
 */

import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionValue,
  useInView,
  useReducedMotion,
  animate,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ── Reveal ─────────────────────────────────────────────────────────────────*/
export function Reveal({
  children,
  delay = 0,
  y = 22,
  blur = true,
  once = true,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  blur?: boolean;
  once?: boolean;
  className?: string;
  as?: "div" | "span" | "li" | "section";
}) {
  const reduce = useReducedMotion();
  const M = motion[as] as typeof motion.div;
  return (
    <M
      initial={reduce ? { opacity: 0 } : { opacity: 0, y, filter: blur ? "blur(10px)" : "blur(0px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once, margin: "-72px" }}
      transition={{ duration: 0.75, ease: EASE, delay }}
      className={className}
    >
      {children}
    </M>
  );
}

/* ── Stagger container + item ────────────────────────────────────────────────*/
export function Stagger({
  children,
  className = "",
  gap = 0.08,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  once?: boolean;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: "-72px" }}
      variants={{ show: { transition: { staggerChildren: gap } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
  y = 22,
}: {
  children: ReactNode;
  className?: string;
  y?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={{
        hidden: reduce ? { opacity: 0 } : { opacity: 0, y, filter: "blur(8px)" },
        show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Words — headline assembles word-by-word from behind a mask ──────────────*/
export function Words({
  text,
  className = "",
  delay = 0,
  once = true,
}: {
  text: string;
  className?: string;
  delay?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  if (reduce) return <span className={className}>{text}</span>;
  return (
    <motion.span
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: "-64px" }}
      transition={{ staggerChildren: 0.055, delayChildren: delay }}
      aria-label={text}
    >
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom" aria-hidden>
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: "108%" },
              show: { y: 0, transition: { duration: 0.8, ease: EASE } },
            }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/* ── Parallax — scroll-linked drift ──────────────────────────────────────────*/
export function Parallax({
  children,
  distance = 80,
  className = "",
}: {
  children: ReactNode;
  distance?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  return (
    <div ref={ref} className={className}>
      <motion.div style={reduce ? undefined : { y }}>{children}</motion.div>
    </div>
  );
}

/* ── Counter — counts up on first view ───────────────────────────────────────*/
export function Counter({
  to,
  suffix = "",
  prefix = "",
  duration = 1.6,
  decimals = 0,
  className = "",
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  decimals?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setVal(to);
      return;
    }
    const controls = animate(0, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, to, duration, reduce]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* ── Marquee — infinite horizontal strip ─────────────────────────────────────*/
export function Marquee({
  children,
  reverse = false,
  className = "",
  pauseOnHover = true,
}: {
  children: ReactNode;
  reverse?: boolean;
  className?: string;
  pauseOnHover?: boolean;
}) {
  return (
    <div className={`group flex overflow-hidden ${className}`}>
      <div
        className={`flex shrink-0 ${reverse ? "marquee-x-rev" : "marquee-x"} ${
          pauseOnHover ? "group-hover:[animation-play-state:paused]" : ""
        }`}
      >
        {children}
        {children}
      </div>
    </div>
  );
}

/* ── ScrollProgress — hairline read-out at the top of the page ───────────────*/
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-flame/80"
      aria-hidden
    />
  );
}

/* ── Tilt — pointer-reactive 3D card ─────────────────────────────────────────*/
export function Tilt({
  children,
  className = "",
  max = 8,
  glare = true,
  style,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  glare?: boolean;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(useMotionValue(0), { stiffness: 220, damping: 20 });
  const ry = useSpring(useMotionValue(0), { stiffness: 220, damping: 20 });
  const gx = useSpring(useMotionValue(50), { stiffness: 220, damping: 20 });
  const gy = useSpring(useMotionValue(50), { stiffness: 220, damping: 20 });
  // Computed unconditionally (rules of hooks) — only rendered when `glare` is on.
  const glareBg = useTransform(
    [gx, gy] as MotionValue<number>[],
    ([x, y]: number[]) => `radial-gradient(220px circle at ${x}% ${y}%, rgba(255,91,46,0.12), transparent 60%)`,
  );

  function onMove(e: React.MouseEvent) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * max * 2);
    rx.set((0.5 - py) * max * 2);
    gx.set(px * 100);
    gy.set(py * 100);
  }
  function onLeave() {
    rx.set(0);
    ry.set(0);
    gx.set(50);
    gy.set(50);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1000, transformStyle: "preserve-3d", ...style }}
      className={`relative ${className}`}
    >
      {children}
      {glare && !reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 hover:opacity-100"
          style={{ background: glareBg }}
        />
      )}
    </motion.div>
  );
}

/* ── Magnetic — element leans toward the cursor ──────────────────────────────*/
export function Magnetic({
  children,
  strength = 0.35,
  className = "",
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 });
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 });

  function onMove(e: React.MouseEvent) {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  }
  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      style={{ x, y }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── AuroraField — drifting iridescent light behind dark sections ────────────*/
export function AuroraField({ className = "", intensity = 1 }: { className?: string; intensity?: number }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div
        className="absolute -left-[15%] top-[-20%] h-[55vh] w-[55vh] rounded-full blur-[100px] animate-aurora-drift"
        style={{ background: "radial-gradient(circle, rgba(255,91,46,0.55), transparent 62%)", opacity: 0.5 * intensity }}
      />
      <div
        className="absolute right-[-10%] top-[10%] h-[50vh] w-[50vh] rounded-full blur-[110px] animate-aurora-drift"
        style={{ background: "radial-gradient(circle, rgba(122,91,255,0.5), transparent 62%)", opacity: 0.5 * intensity, animationDelay: "-6s" }}
      />
      <div
        className="absolute bottom-[-25%] left-[30%] h-[45vh] w-[45vh] rounded-full blur-[110px] animate-aurora-drift"
        style={{ background: "radial-gradient(circle, rgba(255,61,119,0.4), transparent 62%)", opacity: 0.45 * intensity, animationDelay: "-11s" }}
      />
    </div>
  );
}

/* ── GridBackdrop — the faint architectural graph grid behind dark sections ──*/
export function GridBackdrop({ className = "", vignette = true }: { className?: string; vignette?: boolean }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div className="absolute inset-0 grid-faint" />
      {vignette && (
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(120% 80% at 50% -10%, rgba(245,242,234,0.05), transparent 55%)" }}
        />
      )}
    </div>
  );
}

/* ── Label — the tiny all-caps grotesque editorial label ─────────────────────*/
export function Label({ children, className = "", dot = false }: { children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-clay ${className}`}>
      {dot && <span className="h-1 w-1 rounded-full bg-carbon" />}
      {children}
    </span>
  );
}

/* Small helper: a hairline that scrolls its own progress (used as section dividers). */
export function GrowLine({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 90%", "start 40%"] });
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <div ref={ref} className={className}>
      <motion.div style={{ scaleX }} className="h-px origin-left bg-line" />
    </div>
  );
}
