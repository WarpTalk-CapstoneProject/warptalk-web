import { WorkspacePluginsPage } from "@/components/assistant/plugins/workspace-plugins-page";

/**
 * Workspace → Plugins. This route used to redirect to the personal /settings/plugins, from when the
 * catalog was purely personal. Since the plugin marketplace (2026-09-17) a workspace has its own
 * plugin list, chosen by its Owner, and this is where it lives. The personal page is unchanged and
 * still at /settings/plugins.
 */
export default function WorkspacePluginsRoutePage() {
  return <WorkspacePluginsPage />;
}
