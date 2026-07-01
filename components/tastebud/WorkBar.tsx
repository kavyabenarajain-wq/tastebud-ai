import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Wordmark } from "./Wordmark";

/**
 * Minimal workspace chrome (spec Page 8). A single hairline bar — wordmark, a quiet
 * brand chip so the loaded brain is always visible, and an optional right slot.
 * No dashboard nav; the canvas is the star.
 */
export function WorkBar({
  brand,
  back = "/studio/products",
  backLabel = "Back",
  right,
}: {
  brand?: string;
  back?: string;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-hairline px-6">
      <div className="flex items-center gap-4">
        <Link href={back} className="text-muted transition-opacity hover:opacity-60" aria-label="Back">
          <ChevronLeft size={18} />
        </Link>
        <Wordmark size="sm" href="/" />
        {brand && (
          <span className="flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-[12px] text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-ink" />
            {brand}
          </span>
        )}
      </div>
      <div className="flex items-center gap-5 text-[13px] text-muted">
        {right}
        <Link href={back} className="transition-opacity hover:opacity-60">
          {backLabel}
        </Link>
      </div>
    </header>
  );
}
