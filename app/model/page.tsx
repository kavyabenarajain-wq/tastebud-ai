import { redirect } from "next/navigation";

// The model workspace now lives inside the Asset Studio flow.
export default function ModelRedirect() {
  redirect("/studio/model");
}
