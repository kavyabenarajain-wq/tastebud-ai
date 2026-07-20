import type { Config } from "tailwindcss";

/**
 * Design tokens.
 *
 * Two worlds live in this file:
 *  1. The STUDIO tool — monochrome, Apple-grade, the UI recedes so the generated work is the
 *     only colour (canvas/surface/ink/muted/hairline). Untouched.
 *  2. The MARKETING site — a high-contrast, warm-dark, motion-first front of house. A near-black
 *     "void" canvas, bone type, and one iridescent signature (flame → pink → plasma) that carries
 *     the whole site. This is the revamped world.
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Studio tool (monochrome) ──────────────────────────────────────────
        canvas: "#FFFFFF",
        surface: "#F5F5F7",
        ink: "#1D1D1F",
        muted: "#6E6E73",
        hairline: "#D2D2D7",
        "canvas-dk": "#000000",
        "surface-dk": "#0A0A0A",
        "hairline-dk": "#1F1F1F",
        "ink-dk": "#F5F5F7",

        // ── Marketing (legacy beige, kept for any un-migrated surface) ─────────
        cream: "#F0EEE6",
        paper: "#FAF9F5",
        carbon: "#191917",
        clay: "#5C5B53",
        linen: "#DCD9CE",
        terra: "#D97757",

        // ── Marketing (revamp: warm-dark, high-contrast) ──────────────────────
        void: "#0A0A0C", // page canvas — warm near-black
        char: "#101013", // raised surface / cards
        slate: "#17171B", // hover / nested surface
        bone: "#F5F2EA", // primary text — warm white
        ash: "#A7A39A", // secondary text (AA on void)
        steel: "#6C6A63", // dim text / captions
        line: "#26262B", // hairlines on dark
        // Restrained accent — used ONLY in tiny doses (live dot, an arrow, a hairline tick).
        // The real colour on the site comes from the framed generated-work tiles, nothing else.
        flame: "#E4673C", // muted terracotta (heritage of terra), desaturated for restraint
        ember: "#C8765A", // dimmer warm
        // Kept defined for back-compat but intentionally unused in the restrained system:
        blush: "#FF3D77",
        plasma: "#7A5BFF",
        acid: "#D8FF3E",
      },
      fontFamily: {
        // Studio
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
        // Marketing revamp
        display: ["var(--font-display)", "system-ui", "sans-serif"], // Bricolage Grotesque — architectural display
        edito: ["var(--font-edito)", "Georgia", "serif"], // Instrument Serif — editorial italic accents
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"], // JetBrains Mono — technical labels
        // Legacy site pair (kept so any un-migrated import resolves)
        "site-sans": ["var(--font-site-sans)", "system-ui", "-apple-system", "sans-serif"],
        "site-serif": ["var(--font-site-serif)", "Georgia", "serif"],
      },
      letterSpacing: {
        display: "-0.03em",
        tight: "-0.02em",
        wide: "0.18em",
        widest: "0.32em",
      },
      borderRadius: { card: "12px", control: "10px" },
      transitionTimingFunction: {
        brand: "cubic-bezier(0.4, 0, 0.2, 1)",
        spring: "cubic-bezier(0.16, 1, 0.3, 1)", // decisive ease-out for reveals
      },
      maxWidth: { content: "1400px" },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)",
        glow: "0 0 0 1px rgba(255,91,46,0.35), 0 8px 40px -8px rgba(255,91,46,0.45)",
        lift: "0 24px 80px -24px rgba(0,0,0,0.7)",
      },
      backgroundImage: {
        spectrum: "linear-gradient(100deg, #FF5B2E 0%, #FF3D77 42%, #7A5BFF 100%)",
        "spectrum-soft": "linear-gradient(100deg, rgba(255,91,46,0.9), rgba(255,61,119,0.9), rgba(122,91,255,0.9))",
      },
      keyframes: {
        "aurora-drift": {
          "0%, 100%": { transform: "translate3d(-6%, -4%, 0) scale(1)" },
          "50%": { transform: "translate3d(8%, 6%, 0) scale(1.18)" },
        },
        "spin-slow": { to: { transform: "rotate(360deg)" } },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "aurora-drift": "aurora-drift 18s ease-in-out infinite",
        "spin-slow": "spin-slow 26s linear infinite",
        "gradient-pan": "gradient-pan 6s ease infinite",
      },
    },
  },
  plugins: [],
};
export default config;
