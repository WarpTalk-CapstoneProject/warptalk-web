import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function WorkspaceSettingsPage() {
  return <RolePlaceholderPage eyebrow="Workspace" title="Workspace Settings" description="Security, retention, branding, and workspace policy." backHref="/workspace/dashboard" backLabel="Back to workspace dashboard" items={["Workspace identity and branding.", "Retention and export policy.", "Default room settings.", "Future SSO and domain controls."]} />;
}
