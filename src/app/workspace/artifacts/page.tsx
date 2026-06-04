import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function WorkspaceArtifactsPage() {
  return <RolePlaceholderPage eyebrow="Workspace" title="Artifacts" description="Manage transcripts, summaries, exports, recordings, and retention." backHref="/workspace/dashboard" backLabel="Back to workspace dashboard" items={["Workspace-scoped artifact search.", "Retention and export governance.", "Summary approval queue.", "Permissioned transcript and recording access."]} />;
}
