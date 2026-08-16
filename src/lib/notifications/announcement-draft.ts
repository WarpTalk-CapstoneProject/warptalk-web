/**
 * What an admin composes, and whether it may be sent.
 *
 * A send here is irreversible in a way nothing else in the portal is: `AdminNotificationService`
 * writes the row and immediately publishes chunked delivery events onto the
 * `admin-notifications-delivery` Redis stream, which `NotificationStreamConsumerService` reads and
 * fans out. There is no draft state, no recall and no delete — `Status` starts at "Pending" and
 * the only path out of it is "Sent" or "Failed". So the checks below run before the request, not
 * as a nicety but because the round-trip that would have taught the admin the rule has already
 * delivered by the time it answers.
 *
 * Every rule here mirrors one in `CreateAdminNotificationValidator`. That duplication is
 * deliberate and is kept honest by naming the server rule beside each one; the server stays the
 * authority, and its message is surfaced verbatim when it refuses anyway.
 *
 * Deliberately free of React so `node:test` can exercise it without a renderer.
 */

/** The four `NotificationConstants` values the validator accepts on this route. */
export const ANNOUNCEMENT_TYPES = ["ANNOUNCEMENT", "PROMOTION", "MAINTENANCE", "SYSTEM"] as const;

export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

/**
 * The only audience mode the validator allows.
 *
 * `BROADCAST` and `SEGMENT` exist as constants and are refused: "Only SPECIFIC_USERS is supported
 * until a production user/segment resolver is configured." A composer that offered "everyone"
 * would be offering the one thing this endpoint cannot do — and the one thing hardest to undo if
 * it ever started working.
 */
export const ANNOUNCEMENT_TARGET_MODE = "SPECIFIC_USERS";

/** The largest list one request may carry. Past this the composer asks for a narrower audience. */
export const MAX_RECIPIENTS = 1000;

export interface AnnouncementDraft {
  type: AnnouncementType;
  title: string;
  content: string;
  /** User ids from the platform directory. Never emails — the server takes GUIDs. */
  recipientIds: string[];
  imageUrl: string;
  ctaLink: string;
  discountCode: string;
  /** Local `datetime-local` values. Converted to UTC on the way out — see toUtcIso. */
  downtimeStart: string;
  downtimeEnd: string;
}

export interface CreateAdminAnnouncementRequest {
  title: string;
  content: string;
  type: string;
  targetAudienceMode: string;
  specificUserIds: string[];
  segmentId: string | null;
  imageUrl: string | null;
  ctaLink: string | null;
  discountCode: string | null;
  downtimeStart: string | null;
  downtimeEnd: string | null;
}

export function emptyAnnouncementDraft(): AnnouncementDraft {
  return {
    // ANNOUNCEMENT rather than the server's DefaultNotificationType of SYSTEM: SYSTEM is the one
    // type that forbids every optional field, so defaulting to it would greet the composer with
    // inputs it then refuses.
    type: "ANNOUNCEMENT",
    title: "",
    content: "",
    recipientIds: [],
    imageUrl: "",
    ctaLink: "",
    discountCode: "",
    downtimeStart: "",
    downtimeEnd: "",
  };
}

/**
 * The server's own test, character for character: `Regex.IsMatch(input, @"<[^>]+>")`.
 *
 * Matching its bluntness on purpose. It rejects `a < b > c` as readily as `<script>`, and a
 * stricter parser here would pass text the server then refuses — with the refusal arriving only
 * after the composer had been told the content was fine.
 */
export function containsHtml(text: string): boolean {
  return /<[^>]+>/.test(text);
}

/**
 * Whether a type may carry the promotional payload fields.
 *
 * Only SYSTEM may not. The validator empties `DiscountCode`, `ImageUrl` and `CtaLink` for it with
 * error code UNSUPPORTED_PAYLOAD_FIELD — a system notice is the platform speaking about itself,
 * and a discount code on one would read as the platform advertising through its own alerts.
 */
export function typeAllowsPayloadFields(type: AnnouncementType): boolean {
  return type !== "SYSTEM";
}

/** Whether a type must state its downtime window. Only MAINTENANCE does. */
export function typeRequiresDowntime(type: AnnouncementType): boolean {
  return type === "MAINTENANCE";
}

/**
 * A `datetime-local` value as an unambiguous instant.
 *
 * `datetime-local` has no zone, so "2026-08-20T09:00" sent as-is is read by the server as
 * whatever `DateTime` decides — which is not the 09:00 the admin was looking at unless the two
 * machines happen to agree. Converting through `Date` resolves it against the ADMIN's zone, which
 * is the zone they typed in, and the trailing Z then says so out loud.
 */
export function toUtcIso(localValue: string): string | null {
  if (!localValue.trim()) return null;
  const parsed = new Date(localValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function validateAnnouncementDraft(draft: AnnouncementDraft): string | null {
  const title = draft.title.trim();
  if (!title) return "A title is required.";
  if (title.length > 255) return "Title must be 255 characters or fewer.";

  const content = draft.content.trim();
  if (!content) return "The message is required.";
  if (containsHtml(content))
    return "The message cannot contain HTML tags — the notification service refuses them.";

  if (draft.recipientIds.length === 0)
    return "Choose at least one recipient. This endpoint sends to a named list, not to everyone.";
  if (draft.recipientIds.length > MAX_RECIPIENTS)
    return `Choose ${MAX_RECIPIENTS} recipients or fewer.`;

  if (!typeAllowsPayloadFields(draft.type)) {
    // Named individually rather than as "extra fields", so the reader knows which box to clear.
    if (draft.imageUrl.trim()) return "A system notice cannot carry an image.";
    if (draft.ctaLink.trim()) return "A system notice cannot carry a call-to-action link.";
    if (draft.discountCode.trim()) return "A system notice cannot carry a discount code.";
  }

  if (typeRequiresDowntime(draft.type)) {
    const start = toUtcIso(draft.downtimeStart);
    const end = toUtcIso(draft.downtimeEnd);
    if (!start) return "A maintenance notice needs a downtime start.";
    if (!end) return "A maintenance notice needs a downtime end.";
    if (Date.parse(end) <= Date.parse(start))
      return "Downtime must end after it starts.";
  }

  return null;
}

/**
 * The draft as the request body.
 *
 * Blank optional fields go out as null rather than as "". The mapper writes any non-null value
 * into the payload JSON, so an empty string would be stored as a present-but-empty `ctaLink` — a
 * link the client would then try to render.
 */
export function buildCreateRequest(draft: AnnouncementDraft): CreateAdminAnnouncementRequest {
  const optional = (value: string) => (value.trim() ? value.trim() : null);
  const allowsPayload = typeAllowsPayloadFields(draft.type);
  const needsDowntime = typeRequiresDowntime(draft.type);

  return {
    title: draft.title.trim(),
    content: draft.content.trim(),
    type: draft.type,
    targetAudienceMode: ANNOUNCEMENT_TARGET_MODE,
    specificUserIds: draft.recipientIds,
    // Only meaningful in SEGMENT mode, which this endpoint refuses. Always null.
    segmentId: null,
    imageUrl: allowsPayload ? optional(draft.imageUrl) : null,
    ctaLink: allowsPayload ? optional(draft.ctaLink) : null,
    discountCode: allowsPayload ? optional(draft.discountCode) : null,
    // Dropped for every other type: the mapper stores whatever it is given, and a downtime window
    // on a promotion would sit in the payload with nothing to read it.
    downtimeStart: needsDowntime ? toUtcIso(draft.downtimeStart) : null,
    downtimeEnd: needsDowntime ? toUtcIso(draft.downtimeEnd) : null,
  };
}
