"use client";

/**
 * The meeting minutes, as the secretary works on them and as everyone else reads them.
 *
 * WHAT THIS IS NOT
 *   Not a second view of the AI summary. The summary panel shows what a model wrote; this shows
 *   a document with a number, a date of record, an attendance roll, and two people's names
 *   against it. The difference is the whole point of the feature, so the header states who
 *   drafted it and who is answerable for it — never letting the two collapse into one line.
 *
 * WHY THE MACHINE AND THE PERSON ARE PRINTED SEPARATELY
 *   "Drafted by" and "Secretary of record" are different facts. A reader deciding
 *   whether to trust this document needs to see that a person signed it, and the edit count next
 *   to that name is their evidence the person actually read it rather than approving it unseen.
 *
 * WHY EDITING IS A PLAIN TEXTAREA PER FIELD
 *   The parts a secretary corrects are short: an agenda, a decision line, an absence reason, a
 *   closing note. A rich-text surface over a structured document would have to flatten it to
 *   HTML and parse it back, and every round trip is a chance to lose a citation — which is the
 *   one thing on a summary line that lets a reader check it.
 *
 * WHY THIS FILE IS NOW MOSTLY CHROME
 *   It used to render the whole document itself, as a flat stack of labelled key/value rows and
 *   small section headings — everything present, nothing reading as a record. The document proper
 *   moved into `minutes-document.tsx`, which sets it as an A4 page in one of two templates, and
 *   what is left here is what surrounds a document rather than what is in it: which template, the
 *   margin guides, print, download, and the draft → sign → approve → addendum flow.
 *
 *   The one thing deliberately kept OUT of the page is the assigned-work list at the bottom. Those
 *   commitments move as people finish them, and a record that changed whenever somebody ticked a
 *   box would stop being a record. It sits below the page, as work, not as part of the document.
 */

import { useMemo, useState } from "react";
import {
  CheckSquare,
  Square,
  XSquare,
  ClockCounterClockwise,
  DownloadSimple,
  FileText,
  PencilSimple,
  Printer,
  Ruler,
  Spinner,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isRecordShared } from "@/lib/meeting/record-sharing";
import {
  MINUTES_TEMPLATES,
  resolveMinutesTemplate,
  translationLanguagesOf,
  type MinutesPolicyFacts,
  type MinutesTemplateId,
} from "@/lib/meeting/minutes-document";
import { useMeetingMinutes, useMeetingMinutesActions } from "@/hooks/use-meeting-minutes";
import { useRoomActionItems, useUpdateActionItemStatus } from "@/hooks/use-meeting-action-items";
import { useTranslationRoom } from "@/hooks/use-translationRooms";
import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { MeetingActionItemDto } from "@/types/meetingActionItem";
import { meetingMinutesService } from "@/services/meeting-minutes.service";
import {
  isEditable,
  parseMinutesContent,
  type MeetingMinutesContent,
} from "@/types/meetingMinutes";
import {
  MinutesDocument,
  printDocument,
  type MinutesEditHandlers,
} from "@/components/rooms/minutes-document";

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : // en-US to match every other formatter in the app. A hardcoded "vi-VN" printed
      // 20/08/2026 in an otherwise-English document — the same mismatch src/lib/format/currency.ts
      // documents, where a vi-VN hardcode rendered an English invoice as "90.000đ".
      date.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

/** The short form, for the badge beside the number. */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "Signed by secretary",
  APPROVED: "Approved",
};

/**
 * The long form, printed ON THE FACE of the document.
 *
 * A record whose draft status lives only in the app's chrome becomes an unmarked record the
 * moment somebody prints or forwards it — which is exactly when being able to tell a draft from
 * a signed document matters. So the status says what is missing, not just what state it is in.
 */
const DOCUMENT_STATUS: Record<string, string> = {
  DRAFT: "Draft — not signed and not approved",
  IN_REVIEW: "Signed by the secretary — not yet approved by the chair",
  APPROVED: "Approved",
};

export function MinutesPanel({
  roomId,
  canManage,
  onSeek,
}: {
  roomId: string;
  /** Host authority. The host is the secretary and the chair in this product. */
  canManage: boolean;
  /** Jump to a transcript moment, when the surrounding page has a transcript to jump to. */
  onSeek?: (atMs: number) => void;
}) {
  const { data: minutes, isLoading } = useMeetingMinutes(roomId);
  const { createDraft, save, sign, approve, revise } = useMeetingMinutesActions(roomId);

  /*
   * Everything the document needs that does not live on the minutes row itself.
   *
   * All three are already-warm caches rather than new traffic on the common path: the room is the
   * same query key the room page fetched to render this tab at all, and the workspace and its
   * settings are the shell's own. They are read HERE rather than passed in as props because the
   * room page that renders this panel is another branch's file — reaching for the data directly is
   * what lets the document carry a letterhead and a retention window without editing it.
   */
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaceName = useWorkspaceStore((state) => state.activeWorkspaceName);
  const { data: workspace } = useWorkspace(workspaceId ?? "");
  const { data: workspaceSettings } = useWorkspaceSettings(workspaceId ?? "");
  const { data: room } = useTranslationRoom(roomId);

  const [draft, setDraft] = useState<MeetingMinutesContent | null>(null);
  const [editing, setEditing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  /**
   * The reader's template choice for this sitting, or null to follow the default.
   *
   * Not persisted, because there is nowhere honest to persist it yet: the template is a property
   * of the WORKSPACE — a company sends domestic partners one layout and overseas clients the other
   * — and storing one reader's preference in their own browser would quietly make the same
   * document look different to different people on the same team. Until a workspace setting exists
   * this follows the meeting's own language and can be switched per sitting.
   */
  const [chosenTemplate, setChosenTemplate] = useState<MinutesTemplateId | null>(null);

  const stored = useMemo(() => parseMinutesContent(minutes?.content), [minutes?.content]);
  // Editing works on a copy so an in-flight refetch cannot overwrite what is being typed; the
  // copy is dropped the moment editing ends, which is also what discards an abandoned edit.
  const view = editing && draft ? draft : stored;

  /**
   * Writing an edit back to the slot it came from.
   *
   * The document lays sections out into parts for reading and flattens them into numbered clauses.
   * Every one of those clauses carries the index of the stored section (and item) it was built
   * from, so this writes back by index and never by the order anything appeared on the page. Each
   * update SPREADS the item rather than replacing it, which is how the citation survives a
   * reworded sentence: only `text` is touched.
   */
  const edits = useMemo<MinutesEditHandlers>(
    () => ({
      setAgenda: (value) =>
        setDraft((current) => (current ? { ...current, agenda: value } : current)),
      setNotes: (value) =>
        setDraft((current) => (current ? { ...current, notes: value } : current)),
      setSectionText: (sectionIndex, value) =>
        setDraft((current) => {
          if (!current) return current;
          const sections = [...current.sections];
          sections[sectionIndex] = { ...sections[sectionIndex], text: value };
          return { ...current, sections };
        }),
      setItemText: (sectionIndex, itemIndex, value) =>
        setDraft((current) => {
          if (!current) return current;
          const sections = [...current.sections];
          const items = [...(sections[sectionIndex].items ?? [])];
          items[itemIndex] = { ...items[itemIndex], text: value };
          sections[sectionIndex] = { ...sections[sectionIndex], items };
          return { ...current, sections };
        }),
    }),
    [],
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-[13px] text-ink-muted">
        <Spinner size={14} className="animate-spin" />
        Loading minutes…
      </div>
    );
  }

  if (!minutes) {
    return (
      <div className="p-6">
        <div className="max-w-lg space-y-3">
          <h3 className="text-[14px] font-semibold text-ink">No minutes yet</h3>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            The minutes are drafted from the meeting&apos;s own record — attendees, absences and the
            times it opened and closed come straight from the room data, and the body comes from the
            summary. You review and sign; the system does not sign for you.
          </p>
          {canManage ? (
            // The same Button the Summary tab's "Download summary file" uses, rather than a
            // hand-rolled `bg-ink` one. These two sit in sibling tabs of the same record and are
            // the same kind of act — the primary thing to do with this tab — so a black button
            // beside a primary one read as a different, heavier control than it is.
            <Button
              size="sm"
              onClick={() =>
                createDraft.mutate(undefined, {
                  onError: () =>
                    toast.error("Could not draft the minutes. Has the meeting ended?"),
                })
              }
              disabled={createDraft.isPending}
              className="h-8 rounded-md text-[11px] shadow-none"
            >
              {createDraft.isPending ? (
                <Spinner size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}{" "}
              Draft minutes
            </Button>
          ) : (
            <p className="text-[12px] text-ink-subtle">Only the meeting chair can draft the minutes.</p>
          )}
        </div>
      </div>
    );
  }

  const editable = isEditable(minutes) && canManage;

  // The reader's pick, else the default. No longer derived from the meeting's language: the
  // layout is the sender's choice, and a default that changed shape per meeting made the choice
  // harder to notice than it was worth.
  const template = chosenTemplate ?? resolveMinutesTemplate();

  /*
   * The policy block, assembled from what the product genuinely holds.
   *
   *   classification  — the stored document's own field. Nothing derives one: see the comment on
   *                     `MeetingMinutesContent.classification`. Absent today, so no row prints.
   *   record owner    — the secretary named on the minutes row.
   *   circulation     — the room's `artifactAccess`, read through the same helper the sharing
   *                     banner uses. `null` while the room query is in flight, so a document being
   *                     read before that resolves prints no circulation line rather than "host
   *                     only" — the difference between not knowing and knowing it is private.
   *   retention       — the workspace's own artifact retention window, counted from the closing
   *                     time the minutes recorded.
   *   language        — what was spoken, and what the record was also produced in.
   */
  const policy: MinutesPolicyFacts = {
    classification: view.classification,
    recordOwner: minutes.secretaryName,
    recordShared: room ? isRecordShared(room.settings?.artifactAccess) : null,
    artifactRetentionDays: workspaceSettings?.artifactRetentionDays ?? null,
    retentionFrom: view.closedAt ?? null,
    primaryLanguage: view.primaryLanguage,
    translationLanguages: translationLanguagesOf(view),
  };

  function beginEdit() {
    setDraft(structuredClone(stored));
    setEditing(true);
  }

  async function downloadDocx() {
    setDownloading(true);
    try {
      // The layout on screen, so the file the reader gets is the document they were looking
      // at. Without this the server rendered its own default and the switcher silently did
      // not apply to the download.
      const response = await meetingMinutesService.downloadDocx(roomId, template);
      // The server names the file after the minutes number, which is what the recipient files it
      // under. Falling back to the number here rather than to something generic keeps that true
      // even if a proxy strips the header.
      const disposition = String(response.headers?.["content-disposition"] ?? "");
      const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = named ? decodeURIComponent(named) : `${minutes!.minutesNo}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download the minutes.");
    } finally {
      setDownloading(false);
    }
  }

  /** Leaving edit mode drops the working copy, which is also what discards an abandoned edit. */
  function stopEditing() {
    setEditing(false);
    setDraft(null);
  }

  function commit() {
    if (!draft || !minutes) return;
    save.mutate(
      { minutesId: minutes.id, content: JSON.stringify(draft) },
      {
        onSuccess: () => {
          stopEditing();
          toast.success("Minutes saved.");
        },
        onError: () => toast.error("Could not save the minutes."),
      },
    );
  }

  return (
    <div className="space-y-4 py-4">
      {/* Chrome. All of it hidden from the printer — what gets printed is the page below. */}
      <div className="space-y-3 px-6 print:hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border pb-3">
          <span className="font-mono text-[13px] font-semibold text-ink">{minutes.minutesNo}</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              minutes.status === "APPROVED"
                ? "bg-semantic-success/10 text-semantic-success"
                : "bg-surface-2 text-ink-muted",
            )}
          >
            {STATUS_LABEL[minutes.status] ?? minutes.status}
          </span>
          {minutes.version > 1 ? (
            <span className="text-[11px] text-ink-subtle">Revision {minutes.version - 1}</span>
          ) : null}
          <span className="text-[11px] text-ink-subtle">Drafted {formatTime(minutes.createdAt)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TemplateSwitch
            template={template}
            onChange={setChosenTemplate}
            disabled={editing}
          />

          <button
            type="button"
            onClick={() => setShowGuides((current) => !current)}
            aria-pressed={showGuides}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px]",
              showGuides
                ? "border-ink bg-surface-2 text-ink"
                : "border-border text-ink-muted hover:text-ink",
            )}
          >
            <Ruler size={13} />
            Margins
          </button>

          {/* The shared Button, at the size and weight the records page settled on when it grew a
              door to the minutes (#422). That change and this one landed on the same file from
              opposite directions: it restyled the action row of the old stacked panel, and this
              replaced the panel with a document. The row survives either way, so it takes their
              styling rather than keeping a second hand-rolled one beside it. */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Print styles come with a page-shaped layout for almost nothing — see the print
                block in minutes-document.tsx, which redefines --mm and --pt to real physical
                units and sends this page alone to the printer at true A4 size. */}
            <Button
              size="sm"
              variant="outline"
              onClick={printDocument}
              className="h-8 rounded-md text-[11px] shadow-none"
            >
              <Printer size={13} />
              Print
            </Button>
            {/* WT-654: the .docx says which layout it is, because it only has one.
                MeetingMinutesDocxWriter is a single Vietnamese writer — no template argument, no
                second implementation — while the switch above and Print both honour the reader's
                choice. Two buttons side by side, one of them quietly ignoring the control next to
                them, is the part that had to stop. Naming the layout on the button costs a reader
                nothing when it is the layout they wanted, and stops the download being a surprise
                when it is not. The alternative was a second OpenXML writer duplicating a 1300-line
                renderer by hand, which is what WT-637 and WT-639 were cancelled for. */}
            <Button
              size="sm"
              variant="outline"
              onClick={downloadDocx}
              disabled={downloading}
              title={
                template === "global-en"
                  ? "The Word export is only available in the Vietnamese layout. Use Print to keep the international layout."
                  : "Downloads this document in the Vietnamese layout."
              }
              className="h-8 rounded-md text-[11px] shadow-none"
            >
              {downloading ? (
                <Spinner size={13} className="animate-spin" />
              ) : (
                <DownloadSimple size={13} />
              )}
              Download Word (Vietnamese layout)
            </Button>
          </div>
        </div>

        {/* Only when the two disagree. On the Vietnamese layout the button already says what the
            file will be, and a line explaining that it matches would be noise. */}
        {template === "global-en" ? (
          <p className="text-[11px] leading-relaxed text-ink-subtle">
            You are reading the international layout. The Word file is produced in the Vietnamese
            layout — use Print to keep this one.
          </p>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button
                  size="sm"
                  onClick={commit}
                  disabled={save.isPending}
                  className="h-8 rounded-md text-[11px] shadow-none"
                >
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={stopEditing}
                  className="h-8 rounded-md text-[11px] shadow-none"
                >
                  Cancel
                </Button>
                <span className="text-[11px] text-ink-subtle">
                  Edit the document itself — every line with a dashed rule under it can be typed
                  in. Timestamps stay attached to their line.
                </span>
              </>
            ) : null}

            {!editing && editable ? (
              <Button
                size="sm"
                variant="outline"
                onClick={beginEdit}
                className="h-8 rounded-md text-[11px] shadow-none"
              >
                <PencilSimple size={14} />
                Edit
              </Button>
            ) : null}

            {!editing && editable && minutes.status === "DRAFT" ? (
              <Button
                size="sm"
                onClick={() =>
                  sign.mutate(minutes.id, {
                    onSuccess: () => toast.success("Minutes signed."),
                    onError: () => toast.error("Could not sign the minutes."),
                  })
                }
                disabled={sign.isPending}
                className="h-8 rounded-md text-[11px] shadow-none"
              >
                Sign as secretary
              </Button>
            ) : null}

            {!editing && editable && minutes.status === "IN_REVIEW" ? (
              <Button
                size="sm"
                onClick={() =>
                  approve.mutate(minutes.id, {
                    onSuccess: () => toast.success("Minutes approved."),
                    onError: () => toast.error("Could not approve the minutes."),
                  })
                }
                disabled={approve.isPending}
                className="h-8 rounded-md text-[11px] shadow-none"
              >
                Approve as chair
              </Button>
            ) : null}

            {!editing && minutes.status === "APPROVED" ? (
              <Button
                size="sm"
                onClick={() =>
                  revise.mutate(minutes.id, {
                    onSuccess: () => toast.success("Addendum opened."),
                    onError: () => toast.error("Could not open an addendum."),
                  })
                }
                disabled={revise.isPending}
                variant="outline"
                className="h-8 rounded-md text-[11px] shadow-none"
              >
                <ClockCounterClockwise size={14} />
                Draft an addendum
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* The document. The surround is a token colour; the page inside it is not — see the
          component's own comment on why a printed page does not follow the viewer's theme. */}
      <div className="bg-surface-2 print:bg-transparent">
        <MinutesDocument
          minutes={minutes}
          content={view}
          template={template}
          editing={editing}
          edits={edits}
          onSeek={onSeek}
          branding={{
            // The workspace's own name and mark, never WarpTalk's. The store's copy is what the
            // shell already has; the detail query only adds the logo.
            name: workspace?.name ?? workspaceName ?? null,
            logoUrl: workspace?.logoUrl ?? null,
          }}
          policy={policy}
          // Absent reads as TRUE (WT-587): every room created before `saveTranscript` existed
          // keeps its transcript, and a client that cannot see the field must never render a
          // recorded meeting as an unrecorded one. `null` is only "the room has not loaded".
          transcriptKept={room ? (room.settings?.saveTranscript ?? true) : null}
          timeZone={workspaceSettings?.timezone ?? null}
          showGuides={showGuides}
          statusLabel={DOCUMENT_STATUS[minutes.status] ?? minutes.status}
        />
      </div>

      <div className="px-6 print:hidden">
        <ApprovedWork roomId={roomId} />
      </div>
    </div>
  );
}

/**
 * Which of the two layouts the document is set in.
 *
 * A segmented control rather than a dropdown because there are exactly two and the choice is worth
 * seeing: neither replaces the other, and a reader should be able to tell at a glance which one
 * they are looking at without opening a menu. Disabled while editing — swapping the layout under
 * a half-typed correction moves the field the secretary is in.
 */
function TemplateSwitch({
  template,
  onChange,
  disabled,
}: {
  template: MinutesTemplateId;
  onChange: (next: MinutesTemplateId) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Document layout"
      className="inline-flex overflow-hidden rounded-md border border-border"
    >
      {MINUTES_TEMPLATES.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          title={option.note}
          aria-pressed={template === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "px-2.5 py-1.5 text-[12px] transition-colors disabled:opacity-50",
            template === option.id
              ? "bg-surface-2 font-medium text-ink"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The commitments this meeting produced, as things somebody can tick off.
 *
 * Distinct from the "Action assignments" part of the document above it, and deliberately so: that
 * part is the RECORD of what was said, frozen with the document. This is the WORK, and it moves. A
 * record that changed whenever somebody finished a task would stop being a record — which is why
 * this sits below the page rather than on it.
 *
 * Empty until the minutes are approved, because a draft's commitments are proposals.
 */
function ApprovedWork({ roomId }: { roomId: string }) {
  const { data: items } = useRoomActionItems(roomId);
  const updateStatus = useUpdateActionItemStatus(roomId);

  if (!items || items.length === 0) return null;

  function cycle(item: MeetingActionItemDto) {
    // OPEN → DONE → OPEN. Dropping is its own button: a task decided against is a different
    // outcome from one completed, and hiding that behind the same control loses the difference.
    const next = item.status === "OPEN" ? "DONE" : "OPEN";
    updateStatus.mutate(
      { itemId: item.id, status: next },
      { onError: () => toast.error("Could not update the item.") },
    );
  }

  return (
    <section className="space-y-2 border-t border-border pt-4">
      <div>
        <h4 className="text-[13px] font-semibold text-ink">Assigned work</h4>
        <p className="text-[11.5px] text-ink-subtle">
          Not part of the record — the document keeps what the meeting decided, this tracks whether
          it got done.
        </p>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-[13px]">
            <button
              type="button"
              onClick={() => cycle(item)}
              aria-label={item.status === "OPEN" ? "Mark done" : "Reopen"}
              className="mt-[2px] shrink-0 text-ink-subtle hover:text-ink"
            >
              {item.status === "DONE" ? (
                <CheckSquare size={15} weight="fill" className="text-semantic-success" />
              ) : item.status === "DROPPED" ? (
                <XSquare size={15} className="text-ink-subtle" />
              ) : (
                <Square size={15} />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <span className={cn("text-ink", item.status !== "OPEN" && "line-through text-ink-muted")}>
                {item.task}
              </span>
              {/* What the meeting SAID, whether or not it resolved to a person. Showing only the
                  resolved assignee would make an unresolved owner vanish from a line that names one. */}
              {item.ownerName ? (
                <span className="ml-1.5 text-[12px] text-ink-muted">— {item.ownerName}</span>
              ) : null}
              {item.ownerName && !item.ownerParticipantId ? (
                <span className="ml-1.5 text-[11px] text-ink-subtle">(no matching person)</span>
              ) : null}
            </div>

            {item.status === "OPEN" ? (
              <button
                type="button"
                onClick={() =>
                  updateStatus.mutate(
                    { itemId: item.id, status: "DROPPED" },
                    { onError: () => toast.error("Could not update the item.") },
                  )
                }
                className="shrink-0 text-[11px] text-ink-subtle hover:text-ink"
              >
                Drop
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
