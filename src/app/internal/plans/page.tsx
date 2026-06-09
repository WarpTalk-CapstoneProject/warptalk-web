import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function InternalPlansPage() {
  return <RolePlaceholderPage eyebrow="Internal" title="Plans And Subscriptions" description="Plan catalog, subscriptions, credits, invoices, and usage operations." backHref="/internal/dashboard" backLabel="Back to internal dashboard" items={["Plan and feature configuration.", "Subscription status review.", "Credit consumption anomalies.", "Billing support view."]} />;
}
