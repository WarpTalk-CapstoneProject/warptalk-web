import { redirect } from "next/navigation";

export default function LegacyWorkspacePage() {
  redirect("/workspace/dashboard");
}
