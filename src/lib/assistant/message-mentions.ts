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
