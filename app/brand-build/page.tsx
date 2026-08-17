import { redirect } from "next/navigation";

/**
 * "Brand build" is now "Brand Discovery" (the live service page). This stub forwards any old
 * link, bookmark or memory of /brand-build to the new route so nothing 404s.
 */
export default function BrandBuildRedirect() {
  redirect("/brand-discovery");
}
