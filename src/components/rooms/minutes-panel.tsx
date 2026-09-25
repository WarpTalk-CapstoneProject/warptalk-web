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
 *   moved into `minutes-document.tsx`, which sets it as an A4 page, and what is left here is what
 *   surrounds a document rather than what is in it: print, download, who the secretary is, and the
 *   draft → sign → approve → addendum flow. The page itself is the editor for whoever may edit.
 *
 *   The one thing deliberately kept OUT of the page is the assigned-work list at the bottom. Those
 *   commitments move as people finish them, and a record that changed whenever somebody ticked a
 *   box would stop being a record. It sits below the page, as work, not as part of the document.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  Square,
  XSquare,
  ClockCounterClockwise,
  DownloadSimple,
  FilePdf,
  FileText,
  Printer,
  ShareNetwork,
  Spinner,
} from "@phosphor-icons/react/dist/ssr";
import { isAxiosError } from "axios";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isRecordShared } from "@/lib/meeting/record-sharing";
import { getErrorMessage } from "@/lib/api/errors";
import {
  DEFAULT_MINUTES_TEMPLATE,
  formatDocumentMoment,
  originalOnly,
  readMinutesIn,
  translationLanguagesOf,
  type MinutesFileMode,
  type MinutesPolicyFacts,
} from "@/lib/meeting/minutes-document";
import { MinutesShareDialog } from "@/components/rooms/minutes-share-dialog";
import {
  MINUTES_WITHHELD,
  useMeetingMinutes,
  useMeetingMinutesActions,
} from "@/hooks/use-meeting-minutes";
import { useRoomActionItems, useUpdateActionItemStatus } from "@/hooks/use-meeting-action-items";
import { useTranslationRoom } from "@/hooks/use-translationRooms";
import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { MeetingActionItemDto } from "@/types/meetingActionItem";
import { meetingMinutesService } from "@/services/meeting-minutes.service";
import {
  isEditable,
  parseMinutesContent,
  type MeetingMinutesContent,
  type MinutesAttendance,
} from "@/types/meetingMinutes";
import {
  MinutesDocument,
  printDocument,
  type MinutesEditHandlers,
} from "@/components/rooms/minutes-document";
import { getLanguageName, normalizeLanguageCode } from "@/lib/language/languages";
import { artifactLanguageOptions } from "@/lib/meeting/artifact-language-options";
import type { MinutesTranslationDto } from "@/types/meetingMinutes";

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
  generatableLanguages,
  onSeek,
}: {
  roomId: string;
  /** Host authority. The host is the secretary and the chair in this product. */
  canManage: boolean;
  /**
   * WT-703's set, as the room page read it. Absent means the page did not have one, not that
   * nothing may be written — `artifactLanguageOptions` owns what that means.
   */
  generatableLanguages?: readonly string[] | null;
  /** Jump to a transcript moment, when the surrounding page has a transcript to jump to. */
  onSeek?: (atMs: number) => void;
}) {
  const { data: read, isLoading } = useMeetingMinutes(roomId);
  // WT-651: an unapproved document follows the room's artifactAccess policy, so "not shared with
  // you" is one of the three normal answers here rather than a failure.
  const withheld = read === MINUTES_WITHHELD;
  const minutes = withheld ? null : read;
  const { createDraft, save, sign, approve, revise, designateSecretary } =
    useMeetingMinutesActions(roomId);

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
  // WT-705: a NEW translation may only be asked for in the meeting's languages that the workspace
  // still allows. Translations already stored in the minutes stay readable regardless. The prop is
  // the room page's copy of the same server field; the room here answers for callers without one.
  const serverLanguages = generatableLanguages ?? room?.artifactLanguages?.generatable;

  // WHAT IS BEING TYPED, OR NULL WHEN NOTHING IS.
  //
  // The page below IS the editor: whoever may edit types straight into the document, the way they
  // would in Word, with no Edit mode to enter first. Changes collect in this working copy so an
  // in-flight refetch cannot overwrite a half-typed line; null means the page shows exactly what is
  // stored, which is also what Discard goes back to.
  const [draft, setDraft] = useState<MeetingMinutesContent | null>(null);
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);
  const [sharing, setSharing] = useState(false);

  // Host authority for the one action that exists before a document does: drawing it up. The
  // room page only knows whether the viewer hosts; a workspace Owner/Admin carries the same
  // authority everywhere else in the record, and the server agrees (RoomHostAccess).
  const workspaceRole = useWorkspaceRole();
  const hostAuthority = canManage || workspaceRole === "owner" || workspaceRole === "admin";

  const stored = useMemo(() => parseMinutesContent(minutes?.content), [minutes?.content]);

  const carriedLanguages = useMemo(() => translationLanguagesOf(stored), [stored]);
  const base = draft ?? stored;

  /**
   * READING THE RECORD IN ONE LANGUAGE. WT-685.
   *
   * No language chosen is the original and nothing else. Choosing one shows the WHOLE document in
   * that language — stored when the meeting was interpreted into it, generated once when it was
   * not. It used to hang lines of every stored language under the original, picking per section
   * whichever paired first alphabetically, so one page carried [ja] under 3.1 and [vi] under 3.2.
   * A section with no translation now says so in place rather than borrowing another language.
   *
   * The downloaded file follows the same rules (MinutesLanguageView on the server), so what is on
   * screen is what arrives. The original beside the translation is an option for the FILE only.
   *
   * Never while editing: the secretary corrects the original, never a reading of it.
   */
  const [readingLanguage, setReadingLanguage] = useState<string | null>(null);
  const [fetched, setFetched] = useState<MinutesTranslationDto | null>(null);
  const [fileMode, setFileMode] = useState<MinutesFileMode>("mono");
  const translationPollRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (translationPollRef.current !== null) window.clearInterval(translationPollRef.current);
    },
    [],
  );

  const view = useMemo<MeetingMinutesContent>(() => {
    if (!readingLanguage || fetched?.status !== "ready" || !fetched.sections) {
      return originalOnly(base);
    }
    return readMinutesIn(base, readingLanguage, fetched.sections);
  }, [base, readingLanguage, fetched]);

  /**
   * Writing an edit back to the slot it came from.
   *
   * The document lays sections out into parts for reading and flattens them into numbered clauses.
   * Every one of those clauses carries the index of the stored section (and item) it was built
   * from, so this writes back by index and never by the order anything appeared on the page. Each
   * update SPREADS the item rather than replacing it, which is how the citation survives a
   * reworded sentence: only `text` is touched.
   */
  const readInLanguage = useCallback(
    (language: string) => {
      if (translationPollRef.current !== null) {
        window.clearInterval(translationPollRef.current);
        translationPollRef.current = null;
      }

      // Back to the document as it stands. Not a fetch: the original is always already here.
      if (!language) {
        setReadingLanguage(null);
        setFetched(null);
        return;
      }

      setReadingLanguage(language);
      setFetched({ language, sections: null, status: "generating" });

      const stopAt = Date.now() + 90_000;

      const read = async () => {
        try {
          const { data } = await meetingMinutesService.getTranslation(roomId, language);
          // A reader who changed their mind while this was out must not have the old answer land
          // on top of the new one.
          let superseded = false;
          setFetched((current) => {
            if (current && current.language !== data.language) {
              superseded = true;
              return current;
            }
            return data;
          });
          return superseded || data.status !== "generating";
        } catch (error) {
          setReadingLanguage(null);
          setFetched(null);
          // The server's own sentence. WT-703 refuses a language the meeting does not offer with
          // one that names the languages it does — replacing it with a generic apology is what
          // made this picker look broken rather than bounded.
          toast.error(
            await readableErrorMessage(error, "Could not read this record in that language."),
          );
          return true;
        }
      };

      void (async () => {
        if (await read()) return;
        translationPollRef.current = window.setInterval(() => {
          if (Date.now() > stopAt) {
            if (translationPollRef.current !== null) {
              window.clearInterval(translationPollRef.current);
              translationPollRef.current = null;
            }
            setReadingLanguage(null);
            setFetched(null);
            toast.error("That reading has not arrived. Try again.");
            return;
          }
          void read().then((done) => {
            if (done && translationPollRef.current !== null) {
              window.clearInterval(translationPollRef.current);
              translationPollRef.current = null;
            }
          });
        }, 4000);
      })();
    },
    [roomId],
  );

  // The first keystroke starts the working copy from what is stored; every later one builds on it.
  const edits = useMemo<MinutesEditHandlers>(
    () => ({
      setAgenda: (value) => setDraft((current) => ({ ...(current ?? stored), agenda: value })),
      setNotes: (value) => setDraft((current) => ({ ...(current ?? stored), notes: value })),
      setSectionText: (sectionIndex, value) =>
        setDraft((current) => {
          const doc = current ?? stored;
          const sections = [...doc.sections];
          sections[sectionIndex] = { ...sections[sectionIndex], text: value };
          return { ...doc, sections };
        }),
      setItemText: (sectionIndex, itemIndex, value) =>
        setDraft((current) => {
          const doc = current ?? stored;
          const sections = [...doc.sections];
          const items = [...(sections[sectionIndex].items ?? [])];
          items[itemIndex] = { ...items[itemIndex], text: value };
          sections[sectionIndex] = { ...sections[sectionIndex], items };
          return { ...doc, sections };
        }),
      apply: (change) => setDraft((current) => change(current ?? stored)),
    }),
    [stored],
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-[13px] text-ink-muted">
        <Spinner size={14} className="animate-spin" />
        Loading minutes…
      </div>
    );
  }

  if (withheld) {
    return (
      <div className="p-6">
        <div className="max-w-lg space-y-3">
          <h3 className="text-[14px] font-semibold text-ink">Still a draft</h3>
          {/* The same distinction summary-absence.ts draws, in this document's own words: the
              minutes exist and are being worked on, and what is missing is permission rather than
              the document. A flat "unauthorized" here would send somebody who WAS at the meeting
              looking for a broken page instead of asking the host.

              Says what changes it, in the terms the server uses: signing is the act that publishes
              a biên bản, so "once it is signed" is the answer, not "once it is shared". */}
          <p className="text-[13px] leading-relaxed text-ink-muted">
            These minutes have been drawn up but nobody has signed them yet. A draft stays with the
            people who can act on it; you will be able to read it here once the host or the
            secretary signs it.
          </p>
        </div>
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
          {hostAuthority ? (
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

  // What this viewer may do, as the server decided it. The fallbacks only apply to an older server
  // that does not send the flags, and reproduce the rule it enforced: host authority for all of it.
  const canEdit = minutes.canEdit ?? (isEditable(minutes) && hostAuthority);
  const canApprove = minutes.canApprove ?? hostAuthority;
  const canDesignateSecretary = minutes.canDesignateSecretary ?? false;

  // Typing is live on the page unless the reader has switched to a translated reading, where the
  // page is showing words that are not the stored document.
  const editing = canEdit && readingLanguage === null;
  const dirty = draft !== null;

  // One layout. The Vietnamese one is still drawn by the server for an explicit ?template= export,
  // but the page no longer offers a choice: every document is read and edited as the same page.
  const template = DEFAULT_MINUTES_TEMPLATE;

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
    // The languages the RECORD carries — not the one being read, which strips them from `view`.
    translationLanguages: translationLanguagesOf(base),
  };

  /**
   * Download the document in one of its two formats.
   *
   * The PDF is a conversion of the very .docx the other button hands over, made server-side — not
   * a second layout rendered from the same data. Two renderers would drift, and a signed record
   * whose Word copy and PDF copy differ is worse than having no PDF.
   */
  async function download(format: "docx" | "pdf") {
    setDownloading(format);
    try {
      // The layout on screen, in both formats, so the file the reader gets is the document they
      // were looking at. Without this the server renders its own default and the switcher
      // silently does not apply to the download.
      // WT-685: and in the language on screen — alone, or beside the original when asked for.
      const reading = readingLanguage ? { lang: readingLanguage, mode: fileMode } : undefined;
      const response =
        format === "pdf"
          ? await meetingMinutesService.downloadPdf(roomId, template, reading)
          : await meetingMinutesService.downloadDocx(roomId, template, reading);
      // The server names the file after the minutes number and the meeting, which is what the
      // recipient files it under. Falling back to the number here rather than to something
      // generic keeps that true even if a proxy strips the header.
      const disposition = String(response.headers?.["content-disposition"] ?? "");
      const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = named ? decodeURIComponent(named) : `${minutes!.minutesNo}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      // 503 is this deployment having no converter, which is a different sentence from a failed
      // download: the Word file still works, and the person should be told to take that instead.
      const status = isAxiosError(error) ? error.response?.status : undefined;
      toast.error(
        status === 503
          ? "PDF conversion is unavailable here. The Word file still downloads."
          : await readableErrorMessage(error, "Could not download the minutes."),
      );
    } finally {
      setDownloading(null);
    }
  }

  /** Back to the stored document. */
  function discard() {
    setDraft(null);
  }

  function commit() {
    if (!draft || !minutes) return;
    save.mutate(
      { minutesId: minutes.id, content: JSON.stringify(draft) },
      {
        onSuccess: () => {
          // The response is now the stored document, so the working copy has nothing left to hold.
          setDraft(null);
          toast.success("Minutes saved.");
        },
        onError: (error) => toast.error(getErrorMessage(error, "Could not save the minutes.")),
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
          {/* WT-685: this used to be `toLocaleString("en-US")` in the READER's zone — "9/12/26,
              1:29 PM" beside a document saying 06:29 (UTC+00:00) for the same moment. It now
              reads the way the document below it does: same template, same workspace zone. */}
          <span className="text-[11px] text-ink-subtle">
            Drafted{" "}
            {formatDocumentMoment(minutes.createdAt, template, workspaceSettings?.timezone ?? null) ??
              "—"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Disabled only while there are unsaved changes: a translated reading beside a
              half-typed correction is a document nobody is reading. */}
          <ReadingLanguagePicker
            carried={carriedLanguages}
            primaryLanguage={stored?.primaryLanguage}
            generatableLanguages={serverLanguages}
            reading={readingLanguage}
            busy={fetched?.status === "generating"}
            disabled={dirty}
            onChange={readInLanguage}
          />

          {/* The shared Button, at the size and weight the records page settled on when it grew a
              door to the minutes (#422). That change and this one landed on the same file from
              opposite directions: it restyled the action row of the old stacked panel, and this
              replaced the panel with a document. The row survives either way, so it takes their
              styling rather than keeping a second hand-rolled one beside it. */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Print styles come with a page-shaped layout for almost nothing — see the print
                block in minutes-document.tsx, which redefines --mm and --pt to real physical
                units and sends this page alone to the printer at true A4 size. */}
            {readingLanguage ? (
              // Only for the file: the page is one language at a time (WT-685), and a reader who
              // needs the original beside it — a foreign partner's copy — asks for that here.
              <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                <input
                  type="checkbox"
                  checked={fileMode === "bilingual"}
                  onChange={(event) => setFileMode(event.target.checked ? "bilingual" : "mono")}
                />
                File with the original beside it
              </label>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={printDocument}
              className="h-8 rounded-md text-[11px] shadow-none"
            >
              <Printer size={13} />
              Print
            </Button>
            {/* WT-654 named the layout on this button because the server had only one writer to
                render with, and a download that ignored the switcher above had to at least say so.
                That is no longer the case: there are two writers now, the export takes ?template=,
                and `download()` sends whatever layout is on screen. So the label goes back to
                naming the FORMAT, which is the only thing that distinguishes it from the button
                beside it — the layout is the switcher's business, and both files follow it.

                Left as it was, the button was worse than imprecise: a reader on the international
                layout was handed a global-en file under a promise of the Vietnamese one. */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => download("docx")}
              disabled={downloading !== null}
              className="h-8 rounded-md text-[11px] shadow-none"
            >
              {downloading === "docx" ? (
                <Spinner size={13} className="animate-spin" />
              ) : (
                <DownloadSimple size={13} />
              )}
              Download Word
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => download("pdf")}
              disabled={downloading !== null}
              className="h-8 rounded-md text-[11px] shadow-none"
            >
              {downloading === "pdf" ? (
                <Spinner size={13} className="animate-spin" />
              ) : (
                <FilePdf size={13} />
              )}
              Download PDF
            </Button>
            {/* Sharing is the host's to decide, so the button is theirs alone — a reader who
                could hand the document on would be deciding for them. */}
            {canApprove ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSharing(true)}
                className="h-8 rounded-md text-[11px] shadow-none"
              >
                <ShareNetwork size={13} />
                Share
              </Button>
            ) : null}
          </div>
        </div>

        {canEdit || canApprove || canDesignateSecretary ? (
          <div className="flex flex-wrap items-center gap-2">
            {dirty ? (
              <>
                <Button
                  size="sm"
                  onClick={commit}
                  disabled={save.isPending}
                  className="h-8 rounded-md text-[11px] shadow-none"
                >
                  {save.isPending ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={discard}
                  disabled={save.isPending}
                  className="h-8 rounded-md text-[11px] shadow-none"
                >
                  Discard
                </Button>
                <span className="text-[11px] text-ink-subtle">
                  Unsaved changes. Timestamps stay attached to their line.
                </span>
              </>
            ) : editing ? (
              <span className="text-[11px] text-ink-subtle">
                Click any line with a dashed rule in the document below to edit it.
              </span>
            ) : null}

            {canDesignateSecretary ? (
              <SecretaryPicker
                attendees={stored.attendance.present}
                value={minutes.secretaryParticipantId ?? null}
                busy={designateSecretary.isPending}
                onChange={(participantId) =>
                  designateSecretary.mutate(
                    { minutesId: minutes.id, participantId },
                    {
                      onSuccess: () =>
                        toast.success(participantId ? "Secretary assigned." : "Secretary removed."),
                      onError: (error) =>
                        toast.error(getErrorMessage(error, "Could not assign the secretary.")),
                    },
                  )
                }
              />
            ) : null}

            {!dirty && canEdit && minutes.status === "DRAFT" ? (
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

            {!dirty && canApprove && minutes.status === "IN_REVIEW" ? (
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

            {canApprove && minutes.status === "APPROVED" ? (
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
        {/* A REFUSAL A READER CAN ACT ON.
          "This cannot be translated because a person edited it" is a fact; a picker that silently
          does nothing is a bug to whoever clicked it. The document below stays exactly as it is —
          the reading was never going to replace it. */}
      {fetched?.status === "unavailable" && fetched.unavailableReason ? (
        <div className="mx-6 mb-3 rounded-md border border-border bg-surface-1 px-3 py-2 text-[12px] leading-5 text-ink-muted print:hidden">
          {fetched.unavailableReason}
        </div>
      ) : null}

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
          showGuides={false}
          statusLabel={DOCUMENT_STATUS[minutes.status] ?? minutes.status}
        />
      </div>

      <div className="px-6 print:hidden">
        <ApprovedWork roomId={roomId} />
      </div>

      {/* Mounted only while it is open: asking for the sharing state is what CREATES the link,
          and a link should come into being when somebody opens this dialog, not when a page
          renders. */}
      {sharing ? (
        <MinutesShareDialog
          roomId={roomId}
          open={sharing}
          onOpenChange={setSharing}
          documentStatus={minutes.status}
        />
      ) : null}
    </div>
  );
}

/**
 * Who the secretary is — the one person besides host authority who may edit and sign the record.
 *
 * Offered only from the people who attended: the server refuses anyone else, and a secretary who
 * was not in the meeting would be signing for proceedings they never heard. The server also stops
 * offering this once somebody has signed, because the signature line already names who took
 * responsibility.
 */
function SecretaryPicker({
  attendees,
  value,
  busy,
  onChange,
}: {
  attendees: MinutesAttendance["present"];
  value: string | null;
  busy: boolean;
  onChange: (participantId: string | null) => void;
}) {
  const candidates = attendees.filter((person) => Boolean(person.participantId));

  return (
    <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
      Secretary
      <select
        value={value ?? ""}
        disabled={busy}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-[30px] rounded-md border border-border bg-surface-1 px-2 text-[12px] text-ink disabled:opacity-60"
      >
        <option value="">Not assigned</option>
        {candidates.map((person) => (
          <option key={person.participantId} value={person.participantId ?? ""}>
            {person.name}
          </option>
        ))}
      </select>
      {busy ? <Spinner size={13} className="animate-spin text-ink-subtle" /> : null}
    </label>
  );
}

/**
 * Which language to READ the record in.
 *
 * A dropdown and not a segmented control, unlike the layout beside it: the layout has two options
 * and the choice is worth seeing at a glance, while this list is as long as the languages the
 * product speaks.
 *
 * The two groups are labelled because they cost different things. A language the document was
 * drawn up in is already here and appears instantly; anything else is written on request, once,
 * and the first reader waits for it. One flat list would make a model call look like a click.
 *
 * Disabled while editing — the secretary is correcting the original, and a translated column
 * beside a half-typed correction is a document nobody is reading.
 */
function ReadingLanguagePicker({
  carried,
  primaryLanguage,
  generatableLanguages,
  reading,
  busy,
  disabled,
  onChange,
}: {
  carried: string[];
  /** The language the record was drawn up in — "As drawn up" already is that reading. */
  primaryLanguage?: string | null;
  /** WT-705: the server's set (meeting L2 ∩ workspace L1), or absent when it sent none. */
  generatableLanguages?: readonly string[] | null;
  reading: string | null;
  busy: boolean;
  disabled: boolean;
  onChange: (language: string) => void;
}) {
  // What is carried is always offered, unfiltered; only what would be WRITTEN is narrowed to the
  // meeting's own languages — anything else is refused by the server, and a choice that can only
  // fail is not a choice. Both lists come from the one helper: with `keep` for what the select
  // must be able to show, without it for what may actually be written.
  const offered = artifactLanguageOptions(generatableLanguages, [...carried, reading]);
  const writableCodes = new Set(
    artifactLanguageOptions(generatableLanguages).map((option) => option.code),
  );
  const carriedCodes = new Set(
    carried.map((code) => normalizeLanguageCode(code)).filter(Boolean),
  );
  // The language the record was drawn up in is already the "As drawn up" reading, so listing it
  // again under "Written on request" would offer to pay for a translation into itself.
  const primary = normalizeLanguageCode(primaryLanguage ?? "");
  const drawnUp = offered.filter((option) => carriedCodes.has(option.code));
  const writable = offered.filter(
    (option) =>
      !carriedCodes.has(option.code) && option.code !== primary && writableCodes.has(option.code),
  );
  // A reading fetched before the policy changed must still show as selected, or the select
  // would silently snap back to "As drawn up" while the page shows the translation.
  const readingCode = normalizeLanguageCode(reading ?? "");
  const orphanReading =
    readingCode
    && !carriedCodes.has(readingCode)
    && !writable.some((option) => option.code === readingCode)
      ? readingCode
      : null;

  return (
    <div className="inline-flex items-center gap-1.5">
      <select
        // Normalized: every option below carries the helper's normalized code, and a select
        // whose value matches none of its options renders blank.
        value={readingCode}
        disabled={disabled || busy}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Read this record in"
        title="Read this record in another language"
        className="h-[30px] rounded-md border border-border bg-surface-1 px-2 text-[12px] text-ink disabled:opacity-60"
      >
        <option value="">As drawn up</option>
        {drawnUp.length > 0 ? (
          <optgroup label="Drawn up in">
            {drawnUp.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ) : null}
        {writable.length > 0 ? (
          <optgroup label="Written on request">
            {writable.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ) : null}
        {orphanReading ? (
          <option value={orphanReading}>{getLanguageName(orphanReading)}</option>
        ) : null}
      </select>
      {busy ? <Spinner size={13} className="animate-spin text-ink-subtle" /> : null}
    </div>
  );
}

/**
 * The server's own sentence for a refusal, falling back to the caller's generic message.
 *
 * WT-703 refuses a language this meeting does not offer with a sentence that names the ones it
 * does, so `getErrorMessage` does the reading — replacing it with a generic apology is what made
 * this picker look broken rather than bounded. Downloads ask axios for a Blob, so THEIR error
 * body arrives as a Blob rather than parsed JSON and `getErrorMessage` would see nothing in it;
 * that one case is read as text and parsed here first.
 */
async function readableErrorMessage(error: unknown, fallback: string): Promise<string> {
  return (await blobErrorMessage(error)) ?? getErrorMessage(error, fallback);
}

/** The `message` of a JSON error body that arrived as a Blob, or null if it is not one. */
async function blobErrorMessage(error: unknown): Promise<string | null> {
  if (!isAxiosError(error)) return null;
  const body: unknown = error.response?.data;
  if (typeof Blob === "undefined" || !(body instanceof Blob)) return null;
  let data: unknown;
  try {
    data = JSON.parse(await body.text());
  } catch {
    // Not JSON: a real file, or an empty body. Nothing readable in it.
    return null;
  }
  const message =
    data && typeof data === "object"
      ? ((data as { message?: unknown; Message?: unknown }).message ??
        (data as { Message?: unknown }).Message)
      : undefined;
  return typeof message === "string" && message.trim() ? message : null;
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
