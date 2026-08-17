"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";

/**
 * The site-wide light / dark theme.
 *
 * No dependency: a tiny provider that mirrors the `.dark` class on <html> (already set before
 * paint by the inline no-flash script in app/layout.tsx). The toggle persists the choice to
 * localStorage; with no stored choice we follow the OS. Only the MARKETING front-of-house is
 * themed — the studio tool is scoped to `.tb-force-light`, so it stays light regardless.
 */

const STORAGE_KEY = "tb.theme";
type Theme = "light" | "dark";

type Ctx = { theme: Theme; mounted: boolean; toggle: () => void; setTheme: (t: Theme) => void };
const ThemeCtx = createContext<Ctx | null>(null);

/**
 * The inline script string — kept here so the value the <head> runs and the value we read match.
 * DARK IS THE DEFAULT: with no stored choice we start dark (not the OS preference).
 */
export const NO_FLASH_SCRIPT = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var d=s?s==='dark':true;var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){document.documentElement.classList.add('dark');}})();`;

function apply(theme: Theme, animate: boolean) {
  const el = document.documentElement;
  if (animate) {
    el.classList.add("theme-anim");
    window.setTimeout(() => el.classList.remove("theme-anim"), 460);
  }
  el.classList.toggle("dark", theme === "dark");
  el.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  // Sync React state to whatever the no-flash script already put on <html>.
  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
    setMounted(true);
  }, []);

  // Dark is the default; we do NOT auto-follow the OS. The theme only changes when the user
  // toggles it (which stores an explicit choice).

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
    apply(t, true);
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }, [setTheme]);

  return <ThemeCtx.Provider value={{ theme, mounted, toggle, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

/**
 * ThemeToggle — a round, hairline-outlined control with a sun/moon that cross-fades on switch.
 * Renders a neutral placeholder until mounted so the server/client markup never mismatch.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, mounted, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={`relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-linen text-carbon transition-colors duration-300 hover:bg-carbon/[0.06] ${className}`}
    >
      {mounted && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "moon" : "sun"}
            initial={{ opacity: 0, rotate: -35, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 35, scale: 0.6 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center justify-center"
          >
            {isDark ? <Moon size={16} strokeWidth={1.6} /> : <Sun size={16} strokeWidth={1.6} />}
          </motion.span>
        </AnimatePresence>
      )}
    </button>
  );
}
