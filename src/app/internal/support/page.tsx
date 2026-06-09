import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function InternalSupportPage() {
  return <RolePlaceholderPage eyebrow="Internal" title="Support" description="Support queues for customer issues, failed meetings, and artifact problems." backHref="/internal/dashboard" backLabel="Back to internal dashboard" items={["Open customer support cases.", "Failed room diagnostics.", "Artifact generation issues.", "Audit-safe support actions."]} />;
}
