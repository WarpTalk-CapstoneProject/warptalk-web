import { RolePlaceholderPage } from "@/components/dashboard/role-placeholder-page";

export default function ParticipantMeetingsPage() {
  return (
    <RolePlaceholderPage
      eyebrow="Participant"
      title="Recent Meetings"
      description="Participant-scoped meeting history for rooms this user can access."
      backHref="/participant/dashboard"
      backLabel="Back to participant dashboard"
      items={["Upcoming and completed participant meetings.", "Join/setup entry points for active rooms.", "Access to host-shared artifacts only.", "Personal language and device readiness context."]}
    />
  );
}
