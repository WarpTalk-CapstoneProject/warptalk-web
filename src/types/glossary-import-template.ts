/**
 * WT-880 — the glossary import template is a FILE SHAPE the platform admin configures, served by
 * TranscriptService:
 *   GET    /glossaries/import-template                 any signed-in user (workspace tab, dialog)
 *   GET    /admin/global-glossary/import-template      staff, glossary:read
 *   PUT    /admin/global-glossary/import-template      staff, glossary:manage — replaces it whole
 *   DELETE /admin/global-glossary/import-template      staff, glossary:manage — back to default
 * and the languages it can be built for by TranslationRoomService:
 *   GET    /translation-rooms/published-languages      the admin's enabled catalog rows
 */

/** Each key IS the importer's field name (`ParsedGlossaryRow`). Fixed set. */
export type ImportTemplateColumnKey =
  | "sourceTerm"
  | "context"
  | "partOfSpeech"
  | "targetTerm"
  | "usageNote"
  | "domain"
  | "definition"
  | "priority";

export type ImportTemplateGroup = "source" | "target" | "general";

export interface ImportTemplateColumn {
  key: ImportTemplateColumnKey;
  group: ImportTemplateGroup;
  /** 0-based position within its group. */
  order: number;
  hidden: boolean;
  /** The header text, e.g. "Term". Source/Target headers get the language appended in the file. */
  name: string;
  /** Extra header texts the importer accepts for this column. */
  aliases: string[];
}

/** language code (bare ISO-639) → column key → sample value. */
export type ImportTemplateSamples = Record<string, Partial<Record<ImportTemplateColumnKey, string>>>;

/** `SupportedLanguageDto` from TranslationRoomService. */
export interface PublishedLanguageDto {
  code: string;
  name: string;
  nativeName?: string | null;
  isActive: boolean;
}
