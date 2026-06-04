import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function WorkspaceRoomsPage() {
  return <RolePlaceholderPage eyebrow="Workspace" title="Workspace Rooms" description="Workspace-wide meeting governance and room reporting." backHref="/workspace/dashboard" backLabel="Back to workspace dashboard" items={["Filter rooms by department, host, status, and date.", "Review active and ended sessions.", "Route flagged rooms to manager review.", "Monitor room-level usage and artifact readiness."]} />;
}
