/**
 * What the system has indexed about a workspace, as a person can read it.
 *
 * Most fields are nullable on purpose. The two source types carry different provenance — a
 * document chunk has a name and an index, a transcript chunk has a speaker and an offset —
 * and chunks indexed before the payload carried text or facts still exist. They list as
 * themselves, with blanks, rather than being hidden.
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
}

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
 * The closed set the extractor writes (embedding_worker/facts.py). Closed rather than open
 * because an open set produces a different label per chunk — a tag cloud, not a filter.
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
