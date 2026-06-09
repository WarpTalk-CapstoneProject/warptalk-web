import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function WorkspaceTerminologyPage() {
  return <RolePlaceholderPage eyebrow="Workspace" title="Terminology" description="Workspace glossary governance for consistent translation quality." backHref="/workspace/dashboard" backLabel="Back to workspace dashboard" items={["Glossary import and review.", "Term priority by language pair.", "Correction workflow from transcript review.", "AI translation glossary context."]} />;
}
