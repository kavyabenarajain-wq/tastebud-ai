import Link from "next/link";

/** The tastebud wordmark — editorial serif, lowercase, the one constant across the product. */
export function Wordmark({
  size = "md",
  href,
  className = "",
}: {
  size?: "sm" | "md" | "lg" | "hero";
  href?: string;
  className?: string;
}) {
  const scale = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
    hero: "text-[15vw] leading-[0.9] md:text-[12vw]",
  }[size];
  const mark = (
    <span className={`font-serif font-light tracking-tight text-ink ${scale} ${className}`}>
      tastebud
    </span>
  );
  return href ? (
    <Link href={href} className="inline-block transition-opacity duration-300 ease-brand hover:opacity-60">
      {mark}
    </Link>
  ) : (
    mark
  );
}
