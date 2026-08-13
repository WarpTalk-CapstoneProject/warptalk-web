/**
 * What the system has indexed about a workspace, as a person can read it.
 *
 * Most fields are nullable on purpose. Source types carry different provenance — a document
 * chunk has a name and an index, a meeting summary has the meeting's title — and chunks
 * indexed before the payload carried text or facts still exist. They list as themselves,
 * with blanks, rather than being hidden.
 *
 * `speakerName`/`startMs` belong to raw transcript segments, which this listing no longer
 * returns (the API excludes them; they stay indexed for WarpBot). They remain on the type
 * because old rows from before the exclusion can still carry them.
 */
export interface WorkspaceKnowledgeChunkDto {
  chunkId: string;
  sourceType: string;
  text: string | null;
  fact: string | null;
  factCategory: string | null;
  documentId: string | null;
  documentName: string | null;
  chunkIndex: number | null;
  speakerName: string | null;
  startMs: number | null;
  retentionState: string | null;
  deletionState: string | null;
  aiRetrieval: boolean;
  /** A meeting's title on its summary, the term on a glossary entry. Null for documents. */
  sourceTitle: string | null;
}

/**
 * What this page lists. Raw transcript segments are deliberately absent: they are indexed
 * one point per sentence spoken, and a workspace's knowledge is not a wall of half-sentences.
 * The API rejects "transcript" here rather than returning an empty page for it.
 */
export const KNOWLEDGE_SOURCE_TYPES = [
  "document",
  "meeting_summary",
  "glossary",
  "workspace_context",
] as const;

export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

/** `nextCursor` is null on the last page. */
export interface WorkspaceKnowledgePageDto {
  items: WorkspaceKnowledgeChunkDto[];
  nextCursor: string | null;
}

export interface WorkspaceKnowledgeQuery {
  sourceType?: string;
  factCategory?: string;
  cursor?: string;
  pageSize?: number;
}

/**
 * The closed set the extractor writes
 * (warptalk-ai/ai_assistant_worker/knowledge_facts.py FACT_CATEGORIES). Closed rather than
 * open because an open set produces a different label per chunk — a tag cloud, not a filter.
 */
export const FACT_CATEGORIES = [
  "decision",
  "requirement",
  "definition",
  "commitment",
  "risk",
  "reference",
] as const;

export type FactCategory = (typeof FACT_CATEGORIES)[number];

/**
 * What an Owner may correct about a chunk.
 *
 * Three fields, not the whole DTO. The indexed text is the only thing the vector was computed
 * from and the provenance is a record of where the text came from — neither is the reader's to
 * revise. Both nullable strings are meaningful when null: clearing a wrong fact is itself a
 * correction, and is not the same as declining to change it.
 */
export interface UpdateKnowledgeChunkRequest {
  fact: string | null;
  factCategory: string | null;
  aiRetrieval: boolean;
}
