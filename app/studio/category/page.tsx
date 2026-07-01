"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Retired step. The studio now starts from a website (see /studio) and research runs
 * in the background, so category selection is gone. Kept as a redirect for old links.
 */
export default function CategoryRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/studio"); }, [router]);
  return null;
}
