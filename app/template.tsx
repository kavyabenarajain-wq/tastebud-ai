"use client";

import { motion } from "framer-motion";

/**
 * app/template.tsx re-mounts on every navigation, giving the whole product a soft, consistent
 * page-to-page crossfade.
 *
 * IMPORTANT: this animates OPACITY ONLY — no transform/filter. A lingering `transform` or
 * `filter` on this wrapper would establish a containing block and break `position: fixed` for
 * everything inside it (the floating nav, the custom cursor, the scroll-progress bar). Opacity
 * creates no containing block, so fixed chrome stays pinned to the viewport. The lively motion
 * comes from each section's own scroll reveals, not from moving this wrapper.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
