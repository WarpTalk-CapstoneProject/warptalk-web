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
 */

import { useMemo, useState } from "react";
import {
  CheckCircle,
  Circle,
  CheckSquare,
  Square,
  XSquare,
  ClockCounterClockwise,
  DownloadSimple,
  FileText,
  PencilSimple,
  Sparkle,
  Spinner,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { sectionTitle } from "@/lib/meeting/meeting-summary";
import { useMeetingMinutes, useMeetingMinutesActions } from "@/hooks/use-meeting-minutes";
import { useRoomActionItems, useUpdateActionItemStatus } from "@/hooks/use-meeting-action-items";
import type { MeetingActionItemDto } from "@/types/meetingActionItem";
import { meetingMinutesService } from "@/services/meeting-minutes.service";
import {
  counterpartOf,
  isEditable,
  pairByCitation,
  parseMinutesContent,
  type MeetingMinutesContent,
  type MeetingMinutesDto,
  type MinutesItem,
  type MinutesSection,
} from "@/types/meetingMinutes";

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

function formatOffset(atMs: number | null | undefined): string | null {
  if (atMs == null || atMs < 0) return null;
  const total = Math.floor(atMs / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "Signed by secretary",
  APPROVED: "Approved",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <span className="w-36 shrink-0 text-ink-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

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

  const [draft, setDraft] = useState<MeetingMinutesContent | null>(null);
  const [editing, setEditing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const stored = useMemo(() => parseMinutesContent(minutes?.content), [minutes?.content]);
  // Editing works on a copy so an in-flight refetch cannot overwrite what is being typed; the
  // copy is dropped the moment editing ends, which is also what discards an abandoned edit.
  const view = editing && draft ? draft : stored;

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
            <button
              type="button"
              onClick={() =>
                createDraft.mutate(undefined, {
                  onError: () =>
                    toast.error("Could not draft the minutes. Has the meeting ended?"),
                })
              }
              disabled={createDraft.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-canvas disabled:opacity-60"
            >
              {createDraft.isPending ? (
                <Spinner size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}
              Draft minutes
            </button>
          ) : (
            <p className="text-[12px] text-ink-subtle">Only the meeting chair can draft the minutes.</p>
          )}
        </div>
      </div>
    );
  }

  const editable = isEditable(minutes) && canManage;

  function beginEdit() {
    setDraft(structuredClone(stored));
    setEditing(true);
  }

  async function downloadDocx() {
    setDownloading(true);
    try {
      const response = await meetingMinutesService.downloadDocx(roomId);
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
    <div className="space-y-6 p-6">
      <MinutesHeader minutes={minutes} />

      <section className="space-y-1.5">
        <Field label="Meeting" value={view.meetingTitle || "—"} />
        <Field label="Location" value={view.location || "—"} />
        <Field label="Opened at" value={formatTime(view.openedAt)} />
        <Field label="Closed at" value={formatTime(view.closedAt)} />
        {view.scheduledAt ? (
          <Field label="Scheduled for" value={formatTime(view.scheduledAt)} />
        ) : null}
      </section>

      <Attendance content={view} />

      <EditableBlock
        title="Agenda"
        value={view.agenda ?? ""}
        editing={editing}
        placeholder="No agenda recorded."
        onChange={(next) => setDraft((current) => (current ? { ...current, agenda: next } : current))}
      />

      <Sections content={view} editing={editing} setDraft={setDraft} onSeek={onSeek} />

      <ApprovedWork roomId={roomId} />

      <Votes content={view} />

      <EditableBlock
        title="Secretary's notes"
        value={view.notes ?? ""}
        editing={editing}
        placeholder="No additional notes."
        onChange={(next) => setDraft((current) => (current ? { ...current, notes: next } : current))}
      />

      <Signatures minutes={minutes} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={downloadDocx}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[13px] text-ink disabled:opacity-60"
        >
          {downloading ? (
            <Spinner size={14} className="animate-spin" />
          ) : (
            <DownloadSimple size={14} />
          )}
          Download Word
        </button>
        <span className="text-[11px] text-ink-subtle">
          Open it in Word or Google Docs to print or export a PDF.
        </span>
      </div>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {editing ? (
            <>
              <button
                type="button"
                onClick={commit}
                disabled={save.isPending}
                className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-canvas disabled:opacity-60"
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={stopEditing}
                className="rounded-md border border-border px-3 py-1.5 text-[13px] text-ink"
              >
                Cancel
              </button>
            </>
          ) : null}

          {!editing && editable ? (
            <button
              type="button"
              onClick={beginEdit}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[13px] text-ink"
            >
              <PencilSimple size={14} />
              Edit
            </button>
          ) : null}

          {!editing && editable && minutes.status === "DRAFT" ? (
            <button
              type="button"
              onClick={() =>
                sign.mutate(minutes.id, {
                  onSuccess: () => toast.success("Minutes signed."),
                  onError: () => toast.error("Could not sign the minutes."),
                })
              }
              disabled={sign.isPending}
              className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-canvas disabled:opacity-60"
            >
              Sign as secretary
            </button>
          ) : null}

          {!editing && editable && minutes.status === "IN_REVIEW" ? (
            <button
              type="button"
              onClick={() =>
                approve.mutate(minutes.id, {
                  onSuccess: () => toast.success("Minutes approved."),
                  onError: () => toast.error("Could not approve the minutes."),
                })
              }
              disabled={approve.isPending}
              className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-canvas disabled:opacity-60"
            >
              Approve as chair
            </button>
          ) : null}

          {!editing && minutes.status === "APPROVED" ? (
            <button
              type="button"
              onClick={() =>
                revise.mutate(minutes.id, {
                  onSuccess: () => toast.success("Addendum opened."),
                  onError: () => toast.error("Could not open an addendum."),
                })
              }
              disabled={revise.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[13px] text-ink"
            >
              <ClockCounterClockwise size={14} />
              Draft an addendum
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MinutesHeader({ minutes }: { minutes: MeetingMinutesDto }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border pb-4">
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
  );
}

function Attendance({ content }: { content: MeetingMinutesContent }) {
  const { attendance } = content;

  return (
    <section className="space-y-2">
      <h4 className="text-[13px] font-semibold text-ink">Attendees</h4>

      <ul className="space-y-1">
        {attendance.present.length === 0 ? (
          <li className="text-[13px] text-ink-subtle">Nobody was recorded entering the room.</li>
        ) : (
          attendance.present.map((person) => (
            <li key={person.participantId} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-ink">{person.name}</span>
              {person.role === "HOST" ? (
                <span className="text-[11px] text-ink-muted">Chair</span>
              ) : null}
              {person.isExternal ? (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-muted">
                  External guest
                </span>
              ) : null}
              {person.speakLanguage ? (
                <span className="text-[11px] text-ink-subtle">{person.speakLanguage}</span>
              ) : null}
              <span className="text-[11px] text-ink-subtle">{formatTime(person.joinedAt)}</span>
            </li>
          ))
        )}
      </ul>

      {attendance.absent.length > 0 ? (
        <div className="space-y-1 pt-1">
          <h4 className="text-[13px] font-semibold text-ink">Absent</h4>
          <ul className="space-y-1">
            {attendance.absent.map((person) => (
              <li key={person.participantId} className="text-[13px] text-ink">
                {person.name}
                {person.reason ? (
                  <span className="text-ink-muted"> — {person.reason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The rule is printed beside the verdict. A bare "met/not met" would not tell the reader
          what bar was applied, and quorum is exactly the line somebody later disputes. */}
      {attendance.quorumMet != null ? (
        <p className="flex items-center gap-1.5 pt-1 text-[12px] text-ink-muted">
          {attendance.quorumMet ? (
            <CheckCircle size={13} className="text-semantic-success" />
          ) : (
            <Warning size={13} className="text-status-error" />
          )}
          {attendance.presentCount}/{attendance.invitedCount} invited attendees present —{" "}
          {attendance.quorumMet ? "quorum met" : "quorum not met"}
          {attendance.quorumRule ? ` (${attendance.quorumRule.toLowerCase()})` : ""}
        </p>
      ) : null}
    </section>
  );
}

function Sections({
  content,
  editing,
  setDraft,
  onSeek,
}: {
  content: MeetingMinutesContent;
  editing: boolean;
  setDraft: React.Dispatch<React.SetStateAction<MeetingMinutesContent | null>>;
  onSeek?: (atMs: number) => void;
}) {
  if (content.sections.length === 0) {
    return (
      <section className="space-y-2">
        <h4 className="text-[13px] font-semibold text-ink">Proceedings</h4>
        <p className="text-[13px] text-ink-subtle">
          This meeting&apos;s summary has no body to carry into the minutes. The secretary writes
          straight into the notes below.
        </p>
      </section>
    );
  }

  return (
    <>
      {content.sections.map((section, sectionIndex) => {
        // Once per section, not once per line: the pairing rule scans both arrays, and calling it
        // inside the item map made it quadratic for no reason.
        const paired = pairedFor(section, content.translations);

        return (
        <section key={`${section.key}-${sectionIndex}`} className="space-y-2">
          <h4 className="text-[13px] font-semibold text-ink">{sectionTitle(section.key)}</h4>

          {section.kind === "paragraph" ? (
            editing ? (
              <textarea
                value={section.text ?? ""}
                onChange={(event) =>
                  setDraft((current) => {
                    if (!current) return current;
                    const sections = [...current.sections];
                    sections[sectionIndex] = { ...sections[sectionIndex], text: event.target.value };
                    return { ...current, sections };
                  })
                }
                rows={4}
                className="w-full rounded-md border border-border bg-surface-1 p-2 text-[13px] text-ink"
              />
            ) : (
              <>
                <p className="text-[13px] leading-relaxed text-ink">{section.text}</p>
                <Translations
                  section={section}
                  translations={content.translations}
                  pairedLanguage={null}
                />
              </>
            )
          ) : (
            <ul className="space-y-1.5">
              {(section.items ?? []).map((item, itemIndex) => {
                const offset = formatOffset(item.atMs);
                return (
                  <li key={itemIndex} className="flex items-start gap-2 text-[13px]">
                    <Circle size={6} weight="fill" className="mt-[7px] shrink-0 text-ink-subtle" />
                    <div className="min-w-0 flex-1">
                      {editing ? (
                        <input
                          value={item.text}
                          onChange={(event) =>
                            setDraft((current) => {
                              if (!current) return current;
                              const sections = [...current.sections];
                              const items = [...(sections[sectionIndex].items ?? [])];
                              items[itemIndex] = { ...items[itemIndex], text: event.target.value };
                              sections[sectionIndex] = { ...sections[sectionIndex], items };
                              return { ...current, sections };
                            })
                          }
                          className="w-full rounded border border-border bg-surface-1 px-2 py-1 text-[13px] text-ink"
                        />
                      ) : (
                        <span className="text-ink">{item.text}</span>
                      )}
                      {item.owner ? (
                        <span className="ml-1.5 text-[12px] text-ink-muted">— {item.owner}</span>
                      ) : null}
                      {paired && paired.pairs[itemIndex] ? (
                        <TranslatedLine
                          language={paired.language}
                          text={paired.pairs[itemIndex].translated.text}
                        />
                      ) : null}
                    </div>
                    {/* The citation stays on the line even while editing: it is what lets a
                        reader check a signed statement, and losing it silently would remove the
                        only thing making the line verifiable. */}
                    {offset ? (
                      onSeek && item.atMs != null ? (
                        <button
                          type="button"
                          onClick={() => onSeek(item.atMs!)}
                          className="shrink-0 font-mono text-[11px] text-ink-subtle hover:text-ink"
                        >
                          {offset}
                        </button>
                      ) : (
                        <span className="shrink-0 font-mono text-[11px] text-ink-subtle">{offset}</span>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {section.kind === "items" ? (
            <Translations
              section={section}
              translations={content.translations}
              pairedLanguage={paired?.language ?? null}
            />
          ) : null}
        </section>
        );
      })}
    </>
  );
}

/**
 * The first language whose translation of this section pairs line-by-line, if any.
 *
 * Deterministic in language order so the same document does not reorder itself between renders.
 */
function pairedFor(
  section: MinutesSection,
  translations: Record<string, MinutesSection[]> | null | undefined,
): { language: string; pairs: { original: MinutesItem; translated: MinutesItem }[] } | null {
  if (!translations) return null;

  for (const language of Object.keys(translations).sort()) {
    const pairs = pairByCitation(section.items, counterpartOf(section, translations[language])?.items);
    if (pairs) return { language, pairs };
  }
  return null;
}

/**
 * A translated line, set smaller and indented under the original.
 *
 * The subordination is the point: in a bilingual record it must be unmistakable which text is
 * what somebody said and which is a rendering of it. A translation typeset identically to the
 * original is one somebody will later quote as the original.
 */
function TranslatedLine({ language, text }: { language: string; text: string }) {
  return (
    <p className="ml-4 mt-0.5 text-[12px] italic leading-relaxed text-ink-muted">
      <span className="mr-1 font-mono text-[10px] not-italic text-ink-subtle">[{language}]</span>
      {text}
    </p>
  );
}

/** Every language's rendering of one section, paired to the original line where it can be. */
function Translations({
  section,
  translations,
  pairedLanguage,
}: {
  section: MinutesSection;
  translations: Record<string, MinutesSection[]> | null | undefined;
  /** Already shown line-by-line above; printing it again as a block would duplicate it. */
  pairedLanguage: string | null;
}) {
  if (!translations) return null;

  return (
    <>
      {Object.entries(translations).map(([language, sections]) => {
        if (language === pairedLanguage) return null;
        const counterpart = counterpartOf(section, sections);
        if (!counterpart) return null;

        if (counterpart.kind === "paragraph") {
          return counterpart.text ? (
            <TranslatedLine key={language} language={language} text={counterpart.text} />
          ) : null;
        }

        const items = counterpart.items ?? [];
        if (items.length === 0) return null;

        // A block, because nothing here may be claimed to translate any particular line above.
        return (
          <div key={language} className="mt-1">
            {items.map((item: MinutesItem, index: number) => (
              <TranslatedLine key={index} language={language} text={item.text} />
            ))}
          </div>
        );
      })}
    </>
  );
}

/**
 * The commitments this meeting produced, as things somebody can tick off.
 *
 * Distinct from the "Action items" section above it, and deliberately so: that section is the
 * RECORD of what was said, frozen with the document. This is the WORK, and it moves. A record that
 * changed whenever somebody finished a task would stop being a record.
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
    <section className="space-y-2">
      <h4 className="text-[13px] font-semibold text-ink">Assigned work</h4>
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

function Votes({ content }: { content: MeetingMinutesContent }) {
  if (content.votes.length === 0) return null;

  return (
    <section className="space-y-2">
      <h4 className="text-[13px] font-semibold text-ink">Votes</h4>
      <ul className="space-y-1">
        {content.votes.map((vote, index) => (
          <li key={index} className="text-[13px] text-ink">
            {vote.topic}
            <span className="ml-2 text-ink-muted">
              For {vote.forCount} · Against {vote.againstCount} · Abstain{" "}
              {vote.abstainCount}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Signatures({ minutes }: { minutes: MeetingMinutesDto }) {
  return (
    <section className="space-y-1.5 border-t border-border pt-4">
      {/* Three lines, never two. The machine that produced the draft and the person answerable
          for the content are different facts, and collapsing them is exactly the claim this
          product must not make. */}
      <div className="flex gap-2 text-[13px]">
        <span className="w-36 shrink-0 text-ink-muted">Drafted by</span>
        <span className="flex items-center gap-1.5 text-ink">
          <Sparkle size={13} className="text-ink-subtle" />
          {minutes.draftedByEngine ?? "—"}
          <span className="text-[11px] text-ink-subtle">{formatTime(minutes.draftedAt)}</span>
        </span>
      </div>

      <div className="flex gap-2 text-[13px]">
        <span className="w-36 shrink-0 text-ink-muted">Secretary of record</span>
        <span className="text-ink">
          {minutes.secretaryName ?? "Not signed"}
          {minutes.secretarySignedAt ? (
            <span className="ml-1.5 text-[11px] text-ink-subtle">
              {formatTime(minutes.secretarySignedAt)}
            </span>
          ) : null}
          {minutes.secretarySignedAt ? (
            <span className="ml-1.5 text-[11px] text-ink-subtle">
              {minutes.editCountVsDraft > 0
                ? `${minutes.editCountVsDraft} change(s) from the draft`
                : "unchanged from the draft"}
            </span>
          ) : null}
        </span>
      </div>

      <div className="flex gap-2 text-[13px]">
        <span className="w-36 shrink-0 text-ink-muted">Approved by chair</span>
        <span className="text-ink">
          {minutes.chairName ?? "Not approved"}
          {minutes.chairApprovedAt ? (
            <span className="ml-1.5 text-[11px] text-ink-subtle">
              {formatTime(minutes.chairApprovedAt)}
            </span>
          ) : null}
        </span>
      </div>
    </section>
  );
}

function EditableBlock({
  title,
  value,
  editing,
  placeholder,
  onChange,
}: {
  title: string;
  value: string;
  editing: boolean;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-[13px] font-semibold text-ink">{title}</h4>
      {editing ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className="w-full rounded-md border border-border bg-surface-1 p-2 text-[13px] text-ink"
        />
      ) : value ? (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{value}</p>
      ) : (
        <p className="text-[13px] text-ink-subtle">{placeholder}</p>
      )}
    </section>
  );
}
