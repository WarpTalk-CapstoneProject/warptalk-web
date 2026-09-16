"use client";

/**
 * The records grid, as meetings rather than as loose documents.
 *
 * The real page is behind sign-in, an active workspace and a backend holding ended meetings, so
 * the case this was rebuilt for — one meeting whose transcript, summary and minutes used to be
 * three adjacent cards — could not be looked at without arranging all three. The fixtures below
 * are the four shapes that matter:
 *
 *   all three     — the case in the report: it must read as ONE meeting.
 *   partly locked — a withheld transcript beside a readable summary. Opening it must land on the
 *                   summary, or the meeting looks empty when it is not.
 *   one record    — the tab strip still names what it is holding.
 *   nothing open  — every record present, none readable. The card must not look broken.
 *
 * Not linked from anywhere.
 */

import { useState } from "react";

import { ArtifactCard } from "@/components/artifacts/artifact-card";
import { ArtifactRecordView } from "@/components/artifacts/artifact-reader";
import {
  groupEntriesByMeeting,
  preferredEntry,
} from "@/lib/meeting/artifact-library";
import type { ArtifactKind, LibraryEntry } from "@/lib/meeting/artifact-library";

// i18n-allow: a Vietnamese transcript is the PRODUCT'S OWN DATA, not UI copy — WarpTalk exists
// to transcribe this, and previewing the card with English lorem would hide the two things the
// preview is for: how diacritics sit at 8.5px, and how far four lines of Vietnamese actually get.
const TRANSCRIPT_BODY = `Tú: Chào mọi người, hôm nay mình review sprint.
Nhi: Phần dịch tiếng Việt đã ổn hơn nhiều so với tuần trước.
Tú: Còn cái voice clone thì sao?
Nhi: Vẫn chưa đều, lúc nghe tiếng Việt lúc không.`;

const SUMMARY_BODY = `The team reviewed the sprint. Vietnamese translation quality has improved
noticeably. Voice cloning remains inconsistent and was raised as the main risk for the demo.`;

const MINUTES_BODY = `Agenda
Review the quarter

Decisions
- Approve the Q4 budget
- Hold the voice-clone fix for the next release`;

function entry(overrides: Partial<LibraryEntry> & Pick<LibraryEntry, "id" | "kind" | "title">): LibraryEntry {
  return {
    statusLabel: "Ready",
    roomId: "room-1",
    roomTitle: "Sprint review",
    roomCode: "WARP-101",
    hostId: "host-1",
    // i18n-allow: a person's name — the team's own — not UI copy to translate.
    hostName: "Huỳnh Thái Tú",
    meetingEndedAt: "2026-09-05T10:00:00Z",
    durationSeconds: 3600,
    participantCount: 4,
    sourceLanguage: "vi",
    targetLanguages: ["en"],
    body: null,
    absence: null,
    changedAt: "2026-09-05T10:05:00Z",
    ...overrides,
  };
}

const ENTRIES: LibraryEntry[] = [
  // 1. The reported case: three records, one meeting.
  entry({ id: "e1", kind: "transcript", title: "Transcript", body: TRANSCRIPT_BODY }),
  entry({ id: "e2", kind: "summary", title: "AI summary", body: SUMMARY_BODY }),
  entry({
    id: "e3",
    kind: "minutes",
    title: "BB-2026-0007",
    statusLabel: "Approved",
    body: MINUTES_BODY,
    // i18n-allow: people's names — the team's own — not UI copy to translate.
    secretaryName: "Ngô Xuân Hạnh Nhi",
    chairName: "Huỳnh Thái Tú",
    editCountVsDraft: 3,
  }),

  // 2. Withheld transcript, readable summary. Must open on the summary.
  entry({
    id: "e4",
    kind: "transcript",
    title: "Transcript",
    roomId: "room-2",
    roomTitle: "Information meeting 2/9",
    roomCode: "WARP-202",
    // i18n-allow: a person's name.
    hostName: "Trần Mạnh Tuấn",
    body: null,
    absence: "withheld",
  }),
  entry({
    id: "e5",
    kind: "summary",
    title: "AI summary",
    roomId: "room-2",
    roomTitle: "Information meeting 2/9",
    roomCode: "WARP-202",
    // i18n-allow: a person's name.
    hostName: "Trần Mạnh Tuấn",
    body: SUMMARY_BODY,
  }),

  // 3. A meeting with one record.
  entry({
    id: "e6",
    kind: "transcript",
    title: "Transcript",
    roomId: "room-3",
    roomTitle: "Daily standup",
    roomCode: "WARP-303",
    // i18n-allow: a person's name.
    hostName: "Thân Thị Ngọc Vân",
    body: TRANSCRIPT_BODY,
  }),

  // 4. Nothing this viewer can open.
  entry({
    id: "e7",
    kind: "transcript",
    title: "Transcript",
    roomId: "room-4",
    roomTitle: "Test flow required approve",
    roomCode: "WARP-404",
    body: null,
    absence: "withheld",
  }),
  entry({
    id: "e8",
    kind: "summary",
    title: "AI summary",
    roomId: "room-4",
    roomTitle: "Test flow required approve",
    roomCode: "WARP-404",
    statusLabel: "Generating",
    body: null,
    absence: "generating",
  }),
];

export default function RecordsLibraryPreviewPage() {
  const groups = groupEntriesByMeeting(ENTRIES);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [kind, setKind] = useState<ArtifactKind | null>(null);

  const selectedGroup = groups.find((group) => group.roomId === roomId) ?? null;
  const selected = selectedGroup
    ? selectedGroup.entries.find((item) => item.kind === kind) ?? preferredEntry(selectedGroup)
    : null;

  return (
    <main className="min-h-dvh bg-canvas p-8 text-ink">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="text-[18px] font-semibold">Meeting records</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            One card per meeting, each linking to its own page. Below the grid is the record view
            that page renders — the tab strip carries the meeting&apos;s transcript, summary and
            minutes, including the ones that are locked.
          </p>
        </div>

        {/* The real list page's grid: one column, cards are links. */}
        <section aria-label="Meeting records">
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {groups.map((group) => (
              <ArtifactCard key={group.roomId} group={group} workspaceSlug="preview" />
            ))}
          </div>
        </section>

        {/* What the detail page renders. Driven by a local picker here rather than by the route,
            because a preview has no workspace to route inside. */}
        <section aria-label="Record view" className="space-y-2 pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-ink-muted">Showing:</span>
            {groups.map((group) => (
              <button
                key={group.roomId}
                type="button"
                onClick={() => {
                  setRoomId(group.roomId);
                  setKind(null);
                }}
                className={
                  group.roomId === roomId
                    ? "rounded-md bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink"
                    : "rounded-md px-2.5 py-1 text-[11px] text-ink-muted hover:text-ink"
                }
              >
                {group.roomCode}
              </button>
            ))}
          </div>

          {selectedGroup && selected ? (
            <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
              <ArtifactRecordView
                group={selectedGroup}
                entry={selected}
                onSelectKind={setKind}
                workspaceSlug="preview"
              />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[11px] text-ink-subtle">
              Pick a room code above to render the detail page&apos;s record view.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
