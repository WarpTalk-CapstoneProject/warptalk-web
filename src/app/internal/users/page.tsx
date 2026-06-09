import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function InternalUsersPage() {
  return <RolePlaceholderPage eyebrow="Internal" title="Users" description="Internal visibility for user support and access review." backHref="/internal/dashboard" backLabel="Back to internal dashboard" items={["Search users across tenants.", "Review locked/inactive accounts.", "Inspect role assignment history.", "Support account recovery workflows."]} />;
}
