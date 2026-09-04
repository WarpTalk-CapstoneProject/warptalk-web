/**
 * The sources one WarpBot answer actually rests on, as the client reads them.
 *
 * WHAT ARRIVES AND WHY IT IS A STRING
 *     `sourcesJson` on an assistant message: the JSON array the worker published, relayed
 *     verbatim by both backends. The shape is owned by warptalk-ai's citations.py, and neither
 *     .NET service re-models it — one shape, three repos, one place to change it.
 *
 * WHAT THE LIST MEANS
 *     Not "the tools that ran". The worker hands the model a marker with every source it shows
 *     it, then keeps only the markers the answer POINTED AT — and only markers that same turn
 *     issued, so an invented one resolves to nothing. So a chip is a claim the reader can trust:
 *     this answer used this source.
 *
 * WHY PARSING IS TOLERANT AND SILENT
 *     A malformed entry means one missing chip. Throwing would mean a missing ANSWER — the
 *     message is the thing the user asked for, and the provenance under it is not worth losing
 *     it over. Every guard here drops the entry and keeps the rest.
 */

/** Mirrors SOURCE_KINDS in ai_assistant_worker/citations.py. */
export type AnswerSourceKind =
  | "document"
  | "glossary"
  | "knowledge"
  | "meeting"
  | "transcript"
  | "web";

const KNOWN_KINDS: readonly AnswerSourceKind[] = [
  "document",
  "glossary",
  "knowledge",
  "meeting",
  "transcript",
  "web",
];

export interface AnswerSource {
  /** S1, S2 — the handle the model cited it by. Kept for a stable React key. */
  marker: string;
  kind: AnswerSourceKind;
  title: string;
  /** What the client needs to OPEN it: a document id, a room id, a url. Often absent. */
  ref?: string;
}

/** What each kind is called under a chip, for the reader who wonders where a name came from. */
export const SOURCE_KIND_LABEL: Record<AnswerSourceKind, string> = {
  document: "Document",
  glossary: "Glossary",
  knowledge: "Knowledge base",
  meeting: "Meeting",
  transcript: "Transcript",
  web: "Web",
};

export function parseAnswerSources(
  raw: string | null | undefined,
): AnswerSource[] {
  if (!raw || !raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const sources: AnswerSource[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;

    const title = typeof record.title === "string" ? record.title.trim() : "";
    // A chip reading "Untitled" is a worse answer than no chip: it claims provenance and
    // names nothing. Same rule the worker applies when it refuses to register one.
    if (!title) continue;

    const rawKind = typeof record.kind === "string" ? record.kind : "";
    const kind = (KNOWN_KINDS as readonly string[]).includes(rawKind)
      ? (rawKind as AnswerSourceKind)
      : "knowledge";

    const ref = typeof record.ref === "string" ? record.ref.trim() : "";
    sources.push({
      marker:
        typeof record.marker === "string" && record.marker
          ? record.marker
          : `S${sources.length + 1}`,
      kind,
      title,
      ref: ref || undefined,
    });
  }
  return sources;
}

/**
 * Where a chip goes when clicked, or null when it goes nowhere.
 *
 * NULL IS THE COMMON, CORRECT ANSWER. A glossary term has no page; an indexed chunk's
 * `sourceId` is not a route. Guessing a destination from an opaque id would produce chips that
 * 404 — which reads to the user as "this source does not exist", the opposite of what the chip
 * is asserting. Only two destinations are certain enough to link:
 *
 *   web       — an absolute http(s) url IS the destination.
 *   document  — /{slug}/documents/{id} exists, but only once a workspace slug is in hand.
 */
export function answerSourceHref(
  source: AnswerSource,
  workspaceSlug?: string | null,
): string | null {
  if (!source.ref) return null;

  if (source.kind === "web") {
    // http(s) only. A `javascript:` or `data:` ref reaching an href would be model-authored
    // script on the page, and this list crosses two service boundaries before arriving.
    try {
      const url = new URL(source.ref);
      return url.protocol === "http:" || url.protocol === "https:"
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }

  if (source.kind === "document" && workspaceSlug && isUuid(source.ref)) {
    return `/${workspaceSlug}/documents/${source.ref}`;
  }

  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The document route takes an id. A ref that is not one belongs to some other producer's id
 * space, and sending it to /documents/ would ask the reader to look at a 404.
 */
function isUuid(value: string): boolean {
  return UUID.test(value);
}
