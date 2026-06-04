import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function WorkspaceBillingPage() {
  return <RolePlaceholderPage eyebrow="Workspace" title="Billing And Usage" description="Plan, credits, invoices, seats, and usage thresholds." backHref="/workspace/dashboard" backLabel="Back to workspace dashboard" items={["Plan and credit usage.", "Invoices and payment status.", "Seat allocation and limits.", "Usage alerts by AI feature."]} />;
}
