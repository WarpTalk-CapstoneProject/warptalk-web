import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function InternalWorkspacesPage() {
  return <RolePlaceholderPage eyebrow="Internal" title="Workspaces" description="WarpTalk tenant management for customer workspaces." backHref="/internal/dashboard" backLabel="Back to internal dashboard" items={["Tenant search and status.", "Plan and quota visibility.", "Support-safe workspace inspection.", "Workspace health and onboarding state."]} />;
}
