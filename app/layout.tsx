import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

// UI / body type — quiet, neutral.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Display type — editorial serif that carries each page (spec design language).
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "tastebud",
  description: "A considered studio. Build the brand, then make the work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
