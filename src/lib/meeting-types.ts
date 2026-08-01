/**
 * The meeting types the create dialog offers.
 *
 * `value` is what the API stores (TranslationRoomTypes on the backend). `defaults` mirrors
 * TranslationRoomTypePolicy — it is NOT what configures the room, the backend does that from
 * the type alone; it exists so the dialog can tell the user what picking a type will do
 * instead of leaving them to find out after the room exists.
 */
export type MeetingTypeDefaults = {
  requiresApproval: boolean;
  muteOnEntry: boolean;
  autoRecord: boolean;
  breakoutsEnabled: boolean;
  maxParticipants: number;
};

export type MeetingType = {
  label: string;
  value: string;
  defaults: MeetingTypeDefaults;
};

export const MEETING_TYPES: MeetingType[] = [
  {
    label: "Event",
    value: "EVENT",
    defaults: { requiresApproval: false, muteOnEntry: false, autoRecord: false, breakoutsEnabled: true, maxParticipants: 100 },
  },
  {
    label: "Channel Meeting",
    value: "CHANNEL_MEETING",
    defaults: { requiresApproval: false, muteOnEntry: false, autoRecord: false, breakoutsEnabled: true, maxParticipants: 50 },
  },
  {
    label: "Webinar",
    value: "WEBINAR",
    defaults: { requiresApproval: true, muteOnEntry: true, autoRecord: true, breakoutsEnabled: false, maxParticipants: 500 },
  },
  {
    label: "Company Meeting",
    value: "COMPANY_MEETING",
    defaults: { requiresApproval: false, muteOnEntry: true, autoRecord: true, breakoutsEnabled: true, maxParticipants: 500 },
  },
  {
    label: "Virtual Appointment",
    value: "VIRTUAL_APPOINTMENT",
    defaults: { requiresApproval: true, muteOnEntry: false, autoRecord: false, breakoutsEnabled: false, maxParticipants: 2 },
  },
  {
    label: "Live Event",
    value: "LIVE_EVENT",
    defaults: { requiresApproval: true, muteOnEntry: true, autoRecord: true, breakoutsEnabled: false, maxParticipants: 1000 },
  },
];

const BY_LABEL = new Map(MEETING_TYPES.map((type) => [type.label, type]));

export function meetingTypeByLabel(label: string): MeetingType {
  return BY_LABEL.get(label) ?? MEETING_TYPES[0];
}

/**
 * A short, human summary of what this type turns on — shown next to the picker so the choice
 * is not silent. Returns [] for a type that changes nothing beyond the seat count.
 */
export function meetingTypeHighlights(label: string): string[] {
  const { defaults } = meetingTypeByLabel(label);
  const highlights: string[] = [];

  if (defaults.requiresApproval) highlights.push("Duyệt trước khi vào");
  if (defaults.muteOnEntry) highlights.push("Vào là tắt mic");
  if (defaults.autoRecord) highlights.push("Tự ghi hình");
  if (!defaults.breakoutsEnabled) highlights.push("Không breakout");
  highlights.push(
    defaults.maxParticipants === 2
      ? "Tối đa 2 người"
      : `Tối đa ${defaults.maxParticipants.toLocaleString("vi-VN")} người`,
  );

  return highlights;
}
