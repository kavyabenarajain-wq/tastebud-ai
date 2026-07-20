"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

type Variant = "solid" | "outline";
type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "px-5 py-2 text-[12px]",
  md: "px-6 py-3 text-[12px]",
  lg: "px-8 py-4 text-[13px]",
};

/**
 * CTA — the one button, light and monochrome. Ink fill or a hairline outline that fills on
 * hover. No colour. Renders a Next <Link> with `href`, else a native <button>.
 */
export function CTA({
  children,
  href,
  onClick,
  type = "button",
  variant = "solid",
  size = "md",
  arrow = true,
  disabled = false,
  className = "",
  target,
  ariaLabel,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  disabled?: boolean;
  className?: string;
  target?: string;
  ariaLabel?: string;
}) {
  const base =
    "group/cta relative inline-flex select-none items-center justify-center gap-2.5 overflow-hidden rounded-full font-medium uppercase tracking-[0.14em] transition-colors duration-400 ease-brand disabled:pointer-events-none disabled:opacity-40";

  const skins: Record<Variant, string> = {
    solid: "bg-carbon text-paper hover:bg-carbon/85",
    outline: "border border-carbon/25 text-carbon hover:bg-carbon hover:text-paper",
  };

  const cls = `${base} ${SIZES[size]} ${skins[variant]} ${className}`;

  const inner = (
    <>
      <span className="relative overflow-hidden">
        <span className="block transition-transform duration-300 ease-brand group-hover/cta:-translate-y-[130%]">{children}</span>
        <span className="absolute inset-0 block translate-y-[130%] transition-transform duration-300 ease-brand group-hover/cta:translate-y-0">
          {children}
        </span>
      </span>
      {arrow && (
        <ArrowRight size={size === "lg" ? 16 : 14} className="transition-transform duration-300 ease-brand group-hover/cta:translate-x-1" />
      )}
    </>
  );

  return href ? (
    <Link href={href} onClick={onClick} className={cls} target={target} aria-label={ariaLabel}>
      {inner}
    </Link>
  ) : (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} aria-label={ariaLabel}>
      {inner}
    </button>
  );
}

/** ArrowLink — a small caps link with a diagonal arrow that slides up-right on hover. */
export function ArrowLink({
  children,
  href,
  onClick,
  className = "",
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const cls = `group/al relative inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-clay transition-colors duration-300 hover:text-carbon ${className}`;
  const inner = (
    <>
      <span className="relative">
        {children}
        <span className="absolute -bottom-1 left-0 h-px w-full origin-right scale-x-0 bg-carbon transition-transform duration-300 ease-brand group-hover/al:origin-left group-hover/al:scale-x-100" />
      </span>
      <ArrowUpRight size={13} className="transition-transform duration-300 ease-brand group-hover/al:translate-x-0.5 group-hover/al:-translate-y-0.5" />
    </>
  );
  return href ? (
    <Link href={href} onClick={onClick} className={cls}>{inner}</Link>
  ) : (
    <button onClick={onClick} className={cls}>{inner}</button>
  );
}

/** TextLink — inline link with an underline that wipes in from the left. */
export function TextLink({
  children,
  href,
  onClick,
  className = "",
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const cls = `group/tl relative inline-flex items-center gap-1 text-carbon transition-colors ${className}`;
  const inner = (
    <span className="relative">
      {children}
      <span className="absolute -bottom-0.5 left-0 h-px w-full origin-right scale-x-0 bg-carbon/50 transition-transform duration-300 ease-brand group-hover/tl:origin-left group-hover/tl:scale-x-100" />
    </span>
  );
  return href ? (
    <Link href={href} onClick={onClick} className={cls}>{inner}</Link>
  ) : (
    <button onClick={onClick} className={cls}>{inner}</button>
  );
}
