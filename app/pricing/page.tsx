import { redirect } from "next/navigation";

/**
 * There is no standalone pricing page anymore — pricing lives in the Asset building page
 * (`/asset-studio#pricing`). This stub just forwards any old link / bookmark / checkout return
 * there so nothing 404s.
 */
export default function PricingRedirect() {
  redirect("/asset-studio#pricing");
}
