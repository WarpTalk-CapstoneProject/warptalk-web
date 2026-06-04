import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function WorkspaceMembersPage() {
  return <RolePlaceholderPage eyebrow="Workspace" title="Members" description="Invite, assign roles, and govern workspace access." backHref="/workspace/dashboard" backLabel="Back to workspace dashboard" items={["Invite members by email.", "Assign owner, manager, host, and participant roles.", "Review pending invitations.", "Revoke access with audit history."]} />;
}
