import { redirect } from "next/navigation";

/**
 * The self-serve pricing lives inside the Asset Studio, which is coming soon. Forward any old
 * link / bookmark / checkout return to the Asset Studio page so nothing 404s.
 */
export default function PricingRedirect() {
  redirect("/asset-studio");
}
