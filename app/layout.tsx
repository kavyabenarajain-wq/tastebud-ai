import type { Metadata } from "next";
import { Inter, Fraunces, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { AuthSync } from "@/components/tastebud/AuthSync";
import { ThemeProvider, NO_FLASH_SCRIPT } from "@/components/site/theme";

// Studio tool + legacy tokens (unchanged).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

// Marketing display face (`--font-edito`) — self-hosted Bricolage Grotesque (variable), so it
// always loads regardless of Google Fonts. Drives every headline + the tastebud wordmark.
const edito = localFont({
  src: [{ path: "./fonts/Bricolage.woff2", weight: "200 800", style: "normal" }],
  variable: "--font-edito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "tastebud — the studio that already knows your brand",
  description: "tastebud studies your brand — products, palette, voice — then art-directs photoshoots, campaigns and ads that could only be yours.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${display.variable} ${edito.variable} ${mono.variable}`}
    >
      <head>
        {/* Set the theme class before first paint so there's no light→dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AuthSync />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
