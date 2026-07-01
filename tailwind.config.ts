import type { Config } from "tailwindcss";

/**
 * Design tokens — the single source of truth (spec §3).
 * Black, white, and a tight grey ramp only. No chromatic accent anywhere in the UI;
 * the only colour on screen comes from the user's generated images.
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FFFFFF",
        surface: "#F5F5F7",
        ink: "#1D1D1F",
        muted: "#6E6E73",
        hairline: "#D2D2D7",
        // dark mode
        "canvas-dk": "#000000",
        "surface-dk": "#0A0A0A",
        "hairline-dk": "#1F1F1F",
        "ink-dk": "#F5F5F7",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      letterSpacing: { display: "-0.03em", tight: "-0.02em", wide: "0.18em" },
      borderRadius: { card: "12px", control: "10px" },
      transitionTimingFunction: { brand: "cubic-bezier(0.4, 0, 0.2, 1)" },
      maxWidth: { content: "1400px" },
      boxShadow: { card: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)" },
    },
  },
  plugins: [],
};
export default config;
