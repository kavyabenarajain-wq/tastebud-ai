import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Quiet back control, used on every page so there's always a way out. */
export function BackLink({ href, label = "Back", className = "" }: { href: string; label?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 text-[13px] text-muted transition-opacity duration-200 ease-brand hover:opacity-60 ${className}`}
    >
      <ChevronLeft size={15} />
      {label}
    </Link>
  );
}
