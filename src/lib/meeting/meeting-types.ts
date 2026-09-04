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
  {
    label: "External Meeting",
    value: "EXTERNAL_BRIDGE",
    defaults: { requiresApproval: false, muteOnEntry: false, autoRecord: false, breakoutsEnabled: false, maxParticipants: 2 },
  },
];

/**
 * The only type whose meeting does not happen on WarpTalk. The call is on Google Meet, Zoom or
 * Teams, and WarpTalk sits beside it translating: the two seats are the user and one stand-in for
 * everyone on the far side.
 *
 * It needs its own setup — two virtual audio devices, and Meet pointed at them — so surfaces that
 * offer it or open it have to branch, which is why this is a named predicate rather than a string
 * compared in six places.
 */
export const EXTERNAL_BRIDGE_TYPE = "EXTERNAL_BRIDGE";

export function isExternalBridge(value?: string | null): boolean {
  return value?.trim().toUpperCase() === EXTERNAL_BRIDGE_TYPE;
}

const BY_LABEL = new Map(MEETING_TYPES.map((type) => [type.label, type]));

export function meetingTypeByLabel(label: string): MeetingType {
  return BY_LABEL.get(label) ?? MEETING_TYPES[0];
}

const BY_VALUE = new Map(MEETING_TYPES.map((type) => [type.value, type]));

/**
 * The stored API value ("CHANNEL_MEETING") read back as something a person should see
 * ("Channel Meeting"). The create dialog goes label → value; every surface that DISPLAYS an
 * existing room needs the other direction.
 *
 * Returns null rather than falling back to the first type, unlike `meetingTypeByLabel`. That
 * one is fed by a picker whose options come from this list, so an unknown label is a bug and
 * a default is harmless. This one is fed by whatever the database holds, and quietly relabelling
 * an unrecognised type as "Event" would show the viewer a confident wrong answer about how
 * their meeting is configured.
 */
export function meetingTypeByValue(value?: string | null): MeetingType | null {
  if (!value) return null;
  return BY_VALUE.get(value.trim().toUpperCase()) ?? null;
}

// `meetingTypeHighlights` lived here: a summary of what each type turns on, rendered as chips
// beside the workspace name in the Create Room header. The chips are gone — five read-only
// labels across the top of a five-field dialog, reflowing the header on every type change —
// and with the only caller removed the function was dead, so it went with them. The defaults
// it described are still on the type itself and still applied server-side; nothing about what
// a Webinar or an Event configures has changed, only that the dialog no longer recites it.
