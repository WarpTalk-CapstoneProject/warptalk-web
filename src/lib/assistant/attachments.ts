/**
 * WT-474 — attachments on a WarpBot message.
 *
 * One module so the composer, the paste handler, the file picker and the drop target all agree on
 * what is acceptable. The limits here are a COURTESY: they turn a refusal that would otherwise come
 * back from the server into an immediate message. AssistantService and the Python worker enforce
 * the same rules independently, because a caller that skips this UI must not be able to reach the
 * real limits of a Redis Stream field or an OpenAI request.
 */

/** Mirrors AssistantConversationService.SupportedDocumentMimeTypes and the worker's whitelist. */
export const SUPPORTED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;

/**
 * What the file picker offers. Extensions are listed beside the mime types on purpose: a `.md` file
 * frequently arrives with an empty or `application/octet-stream` type on Windows, and a picker that
 * filtered on type alone would refuse a file the system simply failed to label.
 */
export const ATTACHMENT_ACCEPT = [
  "image/*",
  ...SUPPORTED_DOCUMENT_MIME_TYPES,
  ".md",
  ".markdown",
  ".txt",
  ".csv",
  ".json",
  ".pdf",
].join(",");

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export interface ChatAttachment {
  /** `data:<mime>;base64,...` — the bytes. */
  dataUrl: string;
  name: string;
  mimeType: string;
  /** Kept for the chip's size label; never sent. */
  size: number;
}

/**
 * The effective mime type of a picked file.
 *
 * A browser can hand back `""` or `application/octet-stream` for a text-ish file it does not
 * recognise — `.md` is the common one — so the extension is the fallback. Without this, dropping a
 * README is refused for being an unknown type, which reads as a broken feature rather than a
 * deliberate limit.
 */
export function resolveMimeType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;

  const name = file.name.toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "text/markdown";
  if (name.endsWith(".txt")) return "text/plain";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".pdf")) return "application/pdf";
  return file.type || "application/octet-stream";
}

export function isSupportedAttachment(mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") ||
    (SUPPORTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)
  );
}

export function isImageAttachment(attachment: ChatAttachment): boolean {
  return attachment.mimeType.startsWith("image/");
}

/** "312 KB" / "1.4 MB". Bytes are never the useful unit for a person checking an upload. */
export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Why a file cannot be attached, or null when it can. The message is shown verbatim. */
export function rejectionReason(file: File, alreadyAttached: number): string | null {
  if (alreadyAttached >= MAX_ATTACHMENTS) {
    return `WarpBot takes up to ${MAX_ATTACHMENTS} files in one question.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `"${file.name}" is too large — under 5MB, please.`;
  }
  if (!isSupportedAttachment(resolveMimeType(file))) {
    return `WarpBot cannot read "${file.name}". Images, PDF, text, Markdown, CSV and JSON only.`;
  }
  return null;
}

/** Reads a file into the `data:` URL shape the wire carries. */
export async function toAttachment(file: File): Promise<ChatAttachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  return {
    dataUrl,
    // A pasted screenshot has no name — the clipboard gives "image.png" at best and "" often. The
    // server falls back to "attachment", but a chip reading "Pasted image" is what a person
    // recognises in a row of three.
    name: file.name || "Pasted image",
    mimeType: resolveMimeType(file),
    size: file.size,
  };
}
