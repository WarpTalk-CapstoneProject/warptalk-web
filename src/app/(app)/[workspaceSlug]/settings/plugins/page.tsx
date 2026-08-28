import { redirect } from "next/navigation";

export default function WorkspacePluginsRedirectPage() {
  redirect("/settings/plugins");
}
