import type { ChatMessageDto } from "@/types/realtime";

/**
 * Extends the base chat message DTO with file-message fields, populated only when
 * messageType === "file". Kept local to the chat panel — src/types/realtime.ts is
 * off-limits (owned by another in-flight round).
 */
export interface ChatFileMessageDto extends ChatMessageDto {
  fileUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  contentType?: string;
}
