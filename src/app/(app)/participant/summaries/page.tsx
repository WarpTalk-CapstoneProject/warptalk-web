import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function ParticipantSummariesPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Participant AI"
      title="My AI Notes"
      description="Participant-visible summaries and notes shared after meetings."
      backHref="/participant/dashboard"
      backLabel="Back to participant dashboard"
      items={["Permissioned AI summaries.", "Translated notes by preferred language.", "Action items assigned to the participant.", "Read-only artifact access by default."]}
    />
  );
}
