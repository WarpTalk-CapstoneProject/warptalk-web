"use client";

/**
 * Every document the workspace's meetings produced, in one place.
 *
 * This replaces the meeting-shaped archive that used to live here. That page listed one ROW per
 * meeting with its outputs folded into a side rail, which answered "what meetings did we hold?" —
 * a question the Meetings page already answers — and could not answer "where is that transcript?",
 * which is the one people actually arrive with. It also could not show minutes at all: they are
 * not artifacts, and the history endpoint has never returned them.
 *
 * Three things it did that this deliberately does not:
 *   - filtered and searched a hundred already-fetched rows in a `useMemo`, which quietly redefined
 *     search as "search the page you happen to be looking at" and left a workspace's 101st meeting
 *     unreachable with nothing on screen saying so. Every filter here is the server's.
 *   - offered a "With outputs" filter that matched every single row, because the finalizer writes
 *     a transcript and a summary for every meeting that ends, unconditionally.
 *   - dumped a summary artifact's raw JSON into a `<pre>`.
 *
 * The route stays `/history`: `/documents` is the knowledge library and this is not that.
 */

import { useEffect, useState } from "react";
import { SpinnerGap, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DocumentCard } from "@/components/meeting-documents/document-card";
import { DocumentDrawer } from "@/components/meeting-documents/document-drawer";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { FilterChip, FilterChipGroup } from "@/components/ui/filter-chip";
import { PagePlaceholder } from "@/components/workspace/page-placeholder";
import { WorkspaceBody, WorkspacePage, WorkspaceToolbar } from "@/components/workspace/page-chrome";
import { useDrawUpMinutes, useMeetingDocuments } from "@/hooks/use-meeting-documents";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { getErrorMessage } from "@/lib/api/errors";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { MEETING_DOCUMENTS_PAGE_SIZE, meetingDocumentLabel } from "@/types/meetingDocument";
import type { MeetingDocumentDto, MeetingDocumentType } from "@/types/meetingDocument";

/** `all` is the ABSENCE of a type param, not a fifth type. */
type DocumentFilter = "all" | MeetingDocumentType;

const FILTERS: Array<{ value: DocumentFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "TRANSCRIPT_EXPORT", label: meetingDocumentLabel("TRANSCRIPT_EXPORT") },
  { value: "SUMMARY_EXPORT", label: meetingDocumentLabel("SUMMARY_EXPORT") },
  { value: "MINUTES", label: meetingDocumentLabel("MINUTES") },
  { value: "RECORDING", label: meetingDocumentLabel("RECORDING") },
];

export default function MeetingDocumentsPage() {
  const params = useParams<{ workspaceSlug: string }>();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);

  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openDocument, setOpenDocument] = useState<MeetingDocumentDto | null>(null);

  // Debounced because search is now a REQUEST, not an array filter. Typing "quarterly" cost
  // nothing when the rows were already in memory; it costs nine round trips without this.
  // Inline rather than a shared hook, matching useInvitationPolicy in hooks/use-workspace.ts.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const documents = useMeetingDocuments(activeWorkspaceId, {
    type: filter === "all" ? undefined : filter,
    search: debouncedSearch,
    page,
    pageSize: MEETING_DOCUMENTS_PAGE_SIZE,
  });

  const drawUpMinutes = useDrawUpMinutes(activeWorkspaceId);

  const rows = documents.data?.documents ?? [];
  const total = documents.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / MEETING_DOCUMENTS_PAGE_SIZE));

  // Null until a document is actually open. Registering the page with no entity made the
  // assistant widget offer actions for a document that does not exist.
  useRegisterAssistantContext(
    openDocument
      ? {
          pageType: "history",
          entityId: openDocument.translationRoomId,
          workspaceId: openDocument.workspaceId,
          snapshot: {
            title: openDocument.meetingTitle,
            status: openDocument.meetingStatus,
            documentType: meetingDocumentLabel(openDocument.type),
          },
        }
      : null,
  );

  function selectFilter(value: DocumentFilter) {
    setFilter(value);
    // Page 7 of a two-page result is a blank screen that looks like a failure.
    setPage(1);
    setOpenDocument(null);
  }

  function handleDrawUpMinutes(document: MeetingDocumentDto) {
    drawUpMinutes.mutate(document.translationRoomId, {
      onSuccess: (minutes) => toast.success(`Minutes ${minutes.minutesNo} drawn up.`),
      onError: (error) =>
        toast.error(getErrorMessage(error, "Could not draw up the minutes for this meeting.")),
    });
  }

  return (
    <WorkspacePage>
      <WorkspaceToolbar
        filters={
          <FilterChipGroup label="Document types">
            {FILTERS.map((item) => (
              <FilterChip
                key={item.value}
                selected={filter === item.value}
                onClick={() => selectFilter(item.value)}
              >
                {item.label}
              </FilterChip>
            ))}
          </FilterChipGroup>
        }
        actions={
          <>
            {/* The SERVER's count for the current filters, so it stays true across pages. The old
                page showed `rooms.length` — the size of the slice on screen. */}
            <span className="shrink-0 text-[12px] tabular-nums text-ink-subtle">
              {total} {total === 1 ? "document" : "documents"}
            </span>
            <ExpandingSearchDock
              value={search}
              onValueChange={setSearch}
              placeholder="Search by meeting title, code, or description"
              expandedWidth={320}
            />
          </>
        }
      />

      <WorkspaceBody className="flex min-h-0 gap-4 overflow-hidden pb-4">
        <div className="min-w-0 flex-1 overflow-y-auto">
          {documents.isLoading ? (
            <LoadingState />
          ) : documents.isError ? (
            <ErrorState onRetry={() => documents.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState hasFilters={Boolean(debouncedSearch) || filter !== "all"} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    onOpen={() => setOpenDocument(document)}
                    // Offered on the SUMMARY card, because that is the document minutes are drawn
                    // from and so the place a reader is already looking when the thought occurs.
                    // `canDraftMinutes` is the server's answer to every gate at once, so this
                    // never offers what the endpoint would refuse.
                    onDrawUpMinutes={
                      document.type === "SUMMARY_EXPORT" && document.canDraftMinutes
                        ? () => handleDrawUpMinutes(document)
                        : undefined
                    }
                    drawingUpMinutes={
                      drawUpMinutes.isPending &&
                      drawUpMinutes.variables === document.translationRoomId
                    }
                  />
                ))}
              </div>

              {pageCount > 1 ? (
                <Pager
                  page={page}
                  pageCount={pageCount}
                  busy={documents.isFetching}
                  onChange={(next) => {
                    setPage(next);
                    setOpenDocument(null);
                  }}
                />
              ) : null}
            </>
          )}
        </div>

        {/* Hidden under `lg`, where a 400px rail beside a grid leaves neither of them usable.
            The card's own link to the meeting is the narrow-screen path to the same content. */}
        {openDocument ? (
          <div className="hidden w-[400px] shrink-0 lg:block">
            <DocumentDrawer
              document={openDocument}
              workspaceSlug={params.workspaceSlug}
              onClose={() => setOpenDocument(null)}
            />
          </div>
        ) : null}
      </WorkspaceBody>
    </WorkspacePage>
  );
}

/**
 * Numbers, not just arrows. "Page 3 of 9" is the fact that tells a reader the archive is bigger
 * than the screen — which the old page, silently capped at 100 rows, never said at all.
 */
function Pager({
  page,
  pageCount,
  busy,
  onChange,
}: {
  page: number;
  pageCount: number;
  busy: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-[11px] text-ink-muted">
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        disabled={page <= 1 || busy}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </Button>
      <span className="tabular-nums">
        Page {page} of {pageCount}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        disabled={page >= pageCount || busy}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid min-h-[420px] place-items-center">
      <div className="flex items-center gap-2 text-[12px] text-ink-muted">
        <SpinnerGap size={15} className="animate-spin" />
        Loading documents
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-[420px] place-items-center text-center">
      <div>
        <WarningCircle size={22} className="mx-auto text-ink-muted" />
        <p className="mt-3 text-[13px] font-medium text-ink">Documents could not be loaded</p>
        <p className="mt-1 text-[12px] text-ink-muted">
          Check the translation-room service and try again.
        </p>
        <Button variant="outline" size="sm" className="mt-4 h-8" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <PagePlaceholder
      kind="history"
      className="min-h-[420px]"
      title={hasFilters ? "No documents match these filters" : "No meeting documents yet"}
      description={
        hasFilters
          ? "Try another meeting title, code, or document type."
          : "A transcript and an AI summary are kept for every meeting that ends."
      }
    />
  );
}
