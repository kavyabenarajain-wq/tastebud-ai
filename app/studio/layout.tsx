"use client";

import { StudioProvider } from "@/components/tastebud/StudioSession";
import { StudioAuthGate } from "@/components/tastebud/StudioAuthGate";

/**
 * Asset Studio shell. Mounts the onboarding session once so the working Brand Brain
 * (name → category → research → intelligence → products → selection) survives every
 * navigation between the child routes. Stays mounted across /studio/* so state never
 * round-trips through a reload.
 *
 * The whole tree is account-gated: no signed-in account → StudioAuthGate shows the
 * "create an account" page instead of the studio (every shoot bills a Meals ledger keyed
 * to a real email). So opening the studio, or landing in it via a direct link, requires login.
 */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioAuthGate>
      <StudioProvider>{children}</StudioProvider>
    </StudioAuthGate>
  );
}
