"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Retired step. Research now runs in the background from the moment the site is pasted
 * (see StudioSession + /studio/building), so this standalone research screen is gone.
 * Kept as a redirect into the new build screen for any stale links.
 */
export default function ResearchRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/studio/building"); }, [router]);
  return null;
}
