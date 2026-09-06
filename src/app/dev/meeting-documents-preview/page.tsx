"use client";

/**
 * The meeting-documents grid, rendered against a fixture.
 *
 * WHY IT EXISTS
 *   The real page needs a workspace with finished meetings, their artifacts, and minutes — and
 *   production holds ZERO minutes rows and ZERO recordings, so the two card states that most
 *   needed looking at could not be seen anywhere at all. That is the same trap the transcript
 *   preview was built for: a surface nobody could look at is a surface that stays wrong.
 *
 *   It renders the real `DocumentCard`, not a copy of its layout, so what is on screen here is
 *   what the page shows.
 *
 * THE FIXTURE
 *   One card of every type, plus the three states that carry a decision:
 *     - a summary whose meeting can have minutes drawn up (the button)
 *     - a summary whose meeting had no speech (the sentence instead of the button — the
 *       majority case in production, 151 of 161 insufficient summaries)
 *     - a transcript the viewer may not open (HOST_ONLY, the default every room is created with)
 */

import { useState } from "react";
import { useTheme } from "next-themes";

import { DocumentCard } from "@/components/meeting-documents/document-card";
import type { MeetingDocumentDto } from "@/types/meetingDocument";

const ROOM_A = "019f0d00-0de0-7000-9000-0000000000a1";
const ROOM_B = "019f0d00-0de0-7000-9000-0000000000b2";
const ROOM_C = "019f0d00-0de0-7000-9000-0000000000c3";

function doc(overrides: Partial<MeetingDocumentDto> & Pick<MeetingDocumentDto, "id" | "type">): MeetingDocumentDto {
  return {
    status: "COMPLETED",
    translationRoomId: ROOM_A,
    workspaceId: "019f0d00-0de0-7000-9000-00000000w001",
    meetingTitle: "Sprint 14 planning",
    translationRoomCode: "WT-4821",
    meetingStatus: "ENDED",
    meetingEndedAt: "2026-09-04T09:40:00Z",
    sourceLanguage: "vi",
    createdAt: "2026-09-04T09:41:00Z",
    updatedAt: null,
    fileFormat: "markdown",
    fileSizeBytes: 18_400,
    consentRequired: false,
    canOpen: true,
    roomHasMinutes: false,
    isHost: true,
    canDraftMinutes: false,
    minutesUnavailableReason: null,
    ...overrides,
  };
}

const FIXTURE: MeetingDocumentDto[] = [
  doc({ id: "d1", type: "TRANSCRIPT_EXPORT" }),
  doc({
    id: "d2",
    type: "SUMMARY_EXPORT",
    fileFormat: "json",
    canDraftMinutes: true,
  }),
  doc({
    id: "d3",
    type: "MINUTES",
    status: "APPROVED",
    minutesNo: "BB-2026-0042",
    minutesVersion: 2,
    roomHasMinutes: true,
    minutesUnavailableReason: "ALREADY_DRAFTED",
  }),
  doc({
    id: "d4",
    type: "RECORDING",
    fileFormat: "mp4",
    fileSizeBytes: 148_000_000,
    consentRequired: true,
  }),
  // The majority case in production: nobody spoke, so there are no proceedings to record.
  doc({
    id: "d5",
    type: "SUMMARY_EXPORT",
    translationRoomId: ROOM_B,
    meetingTitle: "Daily standup",
    translationRoomCode: "WT-4822",
    fileFormat: "json",
    minutesUnavailableReason: "NOTHING_TO_RECORD",
  }),
  // A room is HOST_ONLY unless somebody says otherwise, so this is ordinary, not an edge case.
  doc({
    id: "d6",
    type: "TRANSCRIPT_EXPORT",
    translationRoomId: ROOM_C,
    // i18n-allow: a person's name, and a deliberately long one — the card has to truncate a
    // real Vietnamese meeting title, not a short English placeholder that never wraps.
    meetingTitle: "Advisor review with Thân Thị Ngọc Vân",
    translationRoomCode: "WT-4823",
    canOpen: false,
    isHost: false,
    minutesUnavailableReason: "NOT_THE_CHAIR",
  }),
  doc({
    id: "d7",
    type: "SUMMARY_EXPORT",
    meetingTitle: "Capstone demo dry run",
    translationRoomCode: "WT-4824",
    status: "PROCESSING",
    fileFormat: "json",
    minutesUnavailableReason: "MEETING_NOT_ENDED",
    meetingStatus: "IN_PROGRESS",
    meetingEndedAt: null,
  }),
];

export default function MeetingDocumentsPreviewPage() {
  const { theme, setTheme } = useTheme();
  const [opened, setOpened] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-surface-1 p-6 text-ink">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold">Meeting documents — card grid</h1>
          <p className="mt-1 text-[12px] text-ink-muted">
            {opened ? `Opened: ${opened}` : "Click a card to check the open affordance."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-md border border-border px-3 py-1.5 text-[12px] text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          Toggle theme
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {FIXTURE.map((document) => (
          <DocumentCard
            key={document.id}
            document={document}
            onOpen={() => setOpened(`${document.type} · ${document.meetingTitle}`)}
            onDrawUpMinutes={
              document.type === "SUMMARY_EXPORT" && document.canDraftMinutes
                ? () => setOpened(`draw up minutes for ${document.meetingTitle}`)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
