import type { Metadata } from "next";
import { Inter, Fraunces, Bricolage_Grotesque, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthSync } from "@/components/tastebud/AuthSync";

// Studio tool type — quiet, neutral.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });

// Marketing revamp type system:
//  • display — Bricolage Grotesque: architectural, characterful, variable weight.
//  • edito   — Instrument Serif: high-contrast editorial serif for italic flourishes.
//  • mono    — JetBrains Mono: technical labels, eyebrows, numbers, nav.
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const edito = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-edito", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "tastebud — the studio that already knows your brand",
  description: "tastebud studies your brand — products, palette, voice — then art-directs photoshoots, campaigns and ads that could only be yours.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${display.variable} ${edito.variable} ${mono.variable}`}
    >
      <body className="font-sans antialiased">
        <AuthSync />
        {children}
      </body>
    </html>
  );
}
