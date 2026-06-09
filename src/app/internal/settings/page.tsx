import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function InternalSettingsPage() {
  return <RolePlaceholderPage eyebrow="Internal" title="System Settings" description="Internal platform configuration and operational policy." backHref="/internal/dashboard" backLabel="Back to internal dashboard" items={["Feature flag overview.", "Internal permission groups.", "Platform notification policies.", "Operational safety defaults."]} />;
}
