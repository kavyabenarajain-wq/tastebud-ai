import Link from "next/link";
import type { ReactNode } from "react";

export function Shell({
  active,
  right,
  children,
}: {
  active: "studio" | "model" | "brand" | "backbrain";
  right?: ReactNode;
  children: ReactNode;
}) {
  const link = (href: string, label: string, id: string) => (
    <Link
      href={href}
      className={`text-sm tracking-tight transition-opacity duration-200 ease-brand hover:opacity-60 ${
        active === id ? "text-ink" : "text-muted"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="flex h-14 items-center justify-between border-b border-hairline px-8">
        <div className="flex items-center gap-8">
          <span className="text-[15px] font-semibold tracking-tight">Creative Co-pilot</span>
          <nav className="flex items-center gap-6">
            {link("/studio", "Asset Studio", "studio")}
            {link("/model", "Model", "model")}
            {link("/brand", "Brand Studio", "brand")}
            {link("/ops/brains", "Back-Brain", "backbrain")}
          </nav>
        </div>
        <div className="text-sm text-muted">{right}</div>
      </header>
      {children}
    </div>
  );
}
