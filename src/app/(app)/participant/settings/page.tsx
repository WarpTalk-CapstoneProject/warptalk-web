import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function ParticipantSettingsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Participant"
      title="Participant Settings"
      description="Personal language, accessibility, and device defaults."
      backHref="/participant/dashboard"
      backLabel="Back to participant dashboard"
      items={["Default speak and listen languages.", "Microphone and speaker preferences.", "Caption and transcript display options.", "Notification preferences for meeting invites."]}
    />
  );
}
