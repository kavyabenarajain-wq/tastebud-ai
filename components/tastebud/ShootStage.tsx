"use client";

import { motion } from "framer-motion";

/**
 * The "shoot in progress" visual for the canvas. A calm camera viewfinder — corner
 * framing marks that breathe and a soft light sweeping across, with the live status
 * beneath. Restrained and monochrome by spec (no loud spinner) — it signals that the
 * shoot is being prepared while the first frames render.
 */
export function ShootStage({ status }: { status?: string }) {
  const ease = [0.4, 0, 0.2, 1] as const;
  // Four corner brackets of a viewfinder.
  const corners = [
    "left-0 top-0 border-l-2 border-t-2 rounded-tl-lg",
    "right-0 top-0 border-r-2 border-t-2 rounded-tr-lg",
    "left-0 bottom-0 border-l-2 border-b-2 rounded-bl-lg",
    "right-0 bottom-0 border-r-2 border-b-2 rounded-br-lg",
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <motion.div
        className="relative h-44 w-44"
        animate={{ scale: [1, 1.03, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease }}
      >
        {corners.map((c) => (
          <span key={c} className={`absolute h-7 w-7 border-ink/70 ${c}`} />
        ))}
        {/* soft light sweeping top→bottom inside the frame */}
        <div className="absolute inset-2 overflow-hidden rounded-md">
          <motion.div
            className="absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-ink/10 to-transparent"
            animate={{ top: ["-33%", "100%"] }}
            transition={{ duration: 1.8, repeat: Infinity, ease }}
          />
        </div>
        {/* centre focus tick */}
        <motion.span
          className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity, ease }}
        />
      </motion.div>
      <motion.p
        key={status}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease }}
        className="mt-6 text-sm text-muted"
      >
        {status || "Preparing your shoot…"}
      </motion.p>
    </div>
  );
}
