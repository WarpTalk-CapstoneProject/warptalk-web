import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function ParticipantAiChatPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Participant AI"
      title="Ask AI"
      description="Participant-scoped chat over permitted transcripts and summaries."
      backHref="/participant/dashboard"
      backLabel="Back to participant dashboard"
      items={["Ask questions about shared meeting notes.", "Limit answers to permitted artifacts.", "Support multilingual answer output.", "Hide workspace-private manager details."]}
    />
  );
}
