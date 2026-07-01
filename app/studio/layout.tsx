"use client";

import { StudioProvider } from "@/components/tastebud/StudioSession";

/**
 * Asset Studio shell. Mounts the onboarding session once so the working Brand Brain
 * (name → category → research → intelligence → products → selection) survives every
 * navigation between the child routes. Stays mounted across /studio/* so state never
 * round-trips through a reload.
 */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <StudioProvider>{children}</StudioProvider>;
}
