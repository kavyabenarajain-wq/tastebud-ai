"use client";

import { motion } from "framer-motion";

/**
 * app/template.tsx re-mounts on every navigation, so this gives the whole product
 * the same soft, slow page-to-page fade (spec design language: "Motion is soft and
 * slow — fades and gentle transitions between pages, never flashy").
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
