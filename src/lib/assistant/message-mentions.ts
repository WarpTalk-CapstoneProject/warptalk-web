import type { AssistantMentionDto } from "@/types/assistant";

const MENTION_TYPES: readonly AssistantMentionDto["entityType"][] = [
  "room",
  "document",
  "member",
  "plugin",
];

/**
 * The @mentions a user message was sent with, read back out of `mentionsJson`.
 *
 * The same stored shape the send path wrote (see AssistantConversationService.SerializeMentions):
 * `[{ entityType, entityId, label, workspaceId }]`. `workspaceId` is the server's own stamp and is
 * not needed to draw a chip, so it is not carried.
 *
 * Forgiving in the way parseAnswerSources is: a row this cannot draw honestly is dropped rather
 * than failing the whole message. An unknown entityType is dropped rather than drawn generically —
 * a chip is a claim about what the user pointed at, and one with no idea what it is claims nothing
 * useful. A missing label falls back to nothing, not to the id: a GUID in a chip reads as a bug.
 */
export function parseMessageMentions(
  raw: string | null | undefined,
): AssistantMentionDto[] {
  if (!raw || !raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const mentions: AssistantMentionDto[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const entityType = record.entityType;
    if (
      typeof entityType !== "string" ||
      !(MENTION_TYPES as readonly string[]).includes(entityType)
    ) {
      continue;
    }
    const entityId = typeof record.entityId === "string" ? record.entityId.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!entityId || !label) continue;

    const key = `${entityType}:${entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    mentions.push({
      entityType: entityType as AssistantMentionDto["entityType"],
      entityId,
      label,
    });
  }
  return mentions;
}

/** How a mention is written into the message text: `@Google Meet`. */
export function mentionToken(label: string): string {
  return `@${label}`;
}

/**
 * Whether the text carries this mention's token as a token, not as the start of a longer word.
 *
 * `@Google Meetings` is not a mention of "@Google Meet": it is a word that happens to begin with
 * one, and treating it as a mention drew a chip followed by a dangling "ings".
 */
export function hasMentionToken(text: string, label: string): boolean {
  return findMentionTokens(text, label).length > 0;
}

function findMentionTokens(text: string, label: string): { start: number; end: number }[] {
  const token = mentionToken(label);
  if (!label.trim()) return [];
  const found: { start: number; end: number }[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf(token, from);
    if (start === -1) return found;
    const end = start + token.length;
    from = end;
    // A word character right after the token means this is a longer name, not this mention.
    if (!/[\p{L}\p{N}_]/u.test(text.slice(end, end + 1))) found.push({ start, end });
  }
}

/**
 * The token that ends at `caret`, for deleting a mention in one keystroke.
 *
 * Backspace used to take one character off "@Google Meet", which dropped the structured mention
 * and left "@Google Mee" in the text as ordinary words — the message then said nothing about the
 * plugin it looked like it named.
 */
export function mentionTokenEndingAt(
  text: string,
  caret: number,
  mentions: { label?: string }[],
): { start: number; end: number; label: string } | null {
  for (const mention of mentions) {
    const label = mention.label?.trim();
    if (!label) continue;
    for (const range of findMentionTokens(text, label)) {
      if (range.end === caret) return { ...range, label };
    }
  }
  return null;
}

export type MentionSegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; mention: AssistantMentionDto };

/**
 * A user message split so each mention is drawn where it was typed.
 *
 * 17 Sep: the composer used to drop "@Google Meet" from the text and keep only a chip, and the
 * bubble drew the chip on a row of its own, so "tạo 1 cuộc họp bằng @Google Meet" read as
 * "tạo 1 cuộc họp bằng" with a stray chip above it. The composer now leaves the token in the
 * text; this finds it again.
 *
 * `unplaced` is every mention whose token is not in the text — anything sent before the token was
 * kept — and is still drawn as the row above, as before.
 */
export function splitMentionTokens(
  content: string,
  mentions: AssistantMentionDto[],
): { segments: MentionSegment[]; unplaced: AssistantMentionDto[] } {
  const ranges: { start: number; end: number; mention: AssistantMentionDto }[] = [];
  const unplaced: AssistantMentionDto[] = [];

  // Longest label first, so "@Google Meet" is not claimed by a shorter "@Google".
  const ordered = [...mentions].sort(
    (a, b) => (b.label ?? "").length - (a.label ?? "").length,
  );
  for (const mention of ordered) {
    const label = mention.label?.trim();
    if (!label) {
      unplaced.push(mention);
      continue;
    }
    let placed = false;
    for (const { start, end } of findMentionTokens(content, label)) {
      if (ranges.some((range) => start < range.end && end > range.start)) continue;
      ranges.push({ start, end, mention });
      placed = true;
    }
    if (!placed) unplaced.push(mention);
  }

  ranges.sort((a, b) => a.start - b.start);
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ kind: "text", text: content.slice(cursor, range.start) });
    }
    segments.push({ kind: "mention", mention: range.mention });
    cursor = range.end;
  }
  if (cursor < content.length) segments.push({ kind: "text", text: content.slice(cursor) });

  // Unplaced keeps the order the user attached them in.
  const order = new Map(mentions.map((mention, index) => [mention, index]));
  unplaced.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { segments, unplaced };
}
