import type { Metadata } from "next";
import { Inter, Fraunces, Archivo, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// UI / body type — quiet, neutral.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Display type — editorial serif that carries each page (spec design language).
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
// Marketing site pair — closest Google stand-ins for Claude's Styrene (sans) and
// Tiempos (serif). Swap these two imports for the licensed files when we have them.
const siteSans = Archivo({ subsets: ["latin"], variable: "--font-site-sans", display: "swap" });
const siteSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-site-serif", display: "swap" });

export const metadata: Metadata = {
  title: "tastebud",
  description: "A considered studio. Build the brand, then make the work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${siteSans.variable} ${siteSerif.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
