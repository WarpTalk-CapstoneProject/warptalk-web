"use client";

/**
 * Option C — the transcript on one side, what it amounts to on the other.
 *
 * THE PROBLEM THIS SOLVES, WHICH IS NOT "HOW DO WE SPLIT THE SCREEN"
 *   Three things want horizontal space on a meeting record: the recording, the transcript, and the
 *   summary. At 1440px they do not fit — 296 for a video column, 620 for a transcript at a readable
 *   66 characters, 380 for a summary is 1296px before a single gutter or margin, which is exactly
 *   enough for all three to be cramped and not enough for any of them to be comfortable. One of the
 *   three has to stop being a column, and the video is the one that can: it shrinks to a 16:9 pip
 *   at the top of the rail and loses nothing, while the other two are text and text does not shrink.
 *
 * WHY 380px AND NOT HALF
 *   A summary is about fifteen lines and takes thirty seconds to read. The transcript beside it is
 *   six hundred lines and takes ten minutes. Splitting the screen down the middle divides it by
 *   nominal importance; 380px divides it by how much reading each side actually holds, which is the
 *   division that leaves both of them usable.
 *
 * WHY THE SYNC RUNS BOTH WAYS
 *   Hovering a claim to light up its paragraph is the obvious direction and the less valuable one.
 *   The direction that earns the layout is the reverse: scroll the transcript and the claim covering
 *   what you are reading lights up on its own. That is what teaches a reader that the summary has a
 *   source — without it, two columns of text side by side are just two columns of text side by side.
 *
 * WHY A CLAIM WITHOUT A CITATION IS NOT IN HERE
 *   Every item in this rail is a button that scrolls the transcript to the sentence it came from. A
 *   claim with no `atMs` cannot do that, cannot light up, and cannot be checked — it would be a
 *   paragraph of assertion sitting in a column whose whole argument is that assertions have
 *   sources. They are counted and pointed at instead, so nothing is silently dropped.
 */

import { useMemo, useState } from "react";
import { CaretDown, CaretUp, VideoCamera } from "@phosphor-icons/react/dist/ssr";

import { MeetingRecordingPlayer, type SeekRequest } from "@/components/rooms/meeting-record-panels";
import {
  ReadingSyncProvider,
  useReadingSync,
} from "@/components/rooms/transcript-reading-sync";
import { TranscriptSpeakerAvatar } from "@/components/rooms/transcript-speaker-avatar";
import { formatCitationTime } from "@/lib/meeting/meeting-summary";
import {
  anchorForMs,
  groupCitationsByAnchor,
  speakingShares,
  type ReadingCitation,
} from "@/lib/transcript/document-reading";
import { resolveTranscriptSpeaker, speakerColorVar } from "@/lib/transcript/speaker-color";
import { groupSavedTranscriptSegments } from "@/lib/transcript/transcript-display";
import { cn } from "@/lib/utils";
import type { MeetingSummarySectionView } from "@/lib/meeting/meeting-summary";
import type { RoomHistoryArtifact } from "@/types/roomHistory";
import type { TranscriptSegmentDto } from "@/types/transcript";

/** One line of the rail, and the moment in the meeting it is answerable to. */
type RailClaim = {
  key: string;
  section: string;
  /** The section title, on the first claim of each run of it — null on the rest. */
  heading: string | null;
  text: string;
  owner?: string;
  atMs: number;
};

type RailTab = "summary" | "attendees";

export function TranscriptReadingLayout({
  transcript,
  sections,
  segments,
  recording,
  seek,
  onConsentGranted,
  onJumpToMoment,
  onOpenSummaryTab,
  speakerDirectory,
}: {
  /** Built by the room page — see the note in transcript-reading-sync.tsx on why it arrives whole. */
  transcript: React.ReactNode;
  /** The summary as the assistant shaped it, or null when the meeting has no summary yet. */
  sections: readonly MeetingSummarySectionView[] | null;
  /** The persisted transcript, for the attendees tab. Control markers are dropped here, not by
   *  the caller — see the note on `shares`. */
  segments: readonly TranscriptSegmentDto[];
  recording: RoomHistoryArtifact | null;
  seek: SeekRequest | null;
  onConsentGranted: () => void;
  onJumpToMoment: (atMs: number) => void;
  /** Where the claims this rail refuses to render can be read in full. */
  onOpenSummaryTab: () => void;
  speakerDirectory?: Readonly<
    Record<string, { fullName?: string | null; avatarUrl?: string | null }>
  >;
}) {
  /**
   * Whether the pip is on screen, and — because of that — how wide a line of this meeting is.
   *
   * The two are one decision. A reader comparing the transcript against the recording is reading in
   * short bursts between glances at the picture, which is what 52ch is for; a reader with the
   * picture put away is reading continuously, which is what 66ch is for. Tying the measure to the
   * pip's own toggle means the reader sets both with one button and can see what the button did,
   * instead of a hidden "compare mode" that changes the text width for reasons nobody can trace.
   *
   * The narrower measure is applied only at `xl`, because that is the only width at which the
   * picture is actually drawn — below it the pip is already a bare transport bar and the column
   * gets its full 66ch back.
   */
  const [pipOpen, setPipOpen] = useState(true);
  const hasPip = Boolean(recording) && pipOpen;

  return (
    <ReadingSyncProvider>
      <div
        className={cn(
          /* The three breakpoints, and they are three genuinely different layouts rather than one
             layout squeezed. ≥1280px: two regions, rail at 380px. 1024–1280px: rail at 320px and
             the pip collapsed to its transport bar (see MeetingRecordingPlayer's `pip` variant).
             <1024px: stacked, and the SUMMARY GOES FIRST — on a small screen people read the
             summary and then decide whether the transcript is worth their next ten minutes, so
             putting the transcript above it buries the thing that answers that question. */
          "grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px]",
          // The measure is declared HERE, on the ancestor of both regions, because it is a fact
          // about the pair and not about the column: it is the pip's presence that decides it.
          // 52ch only at `xl`, which is the only width where the pip is actually a picture.
          "[--reading-measure:66ch]",
          hasPip ? "xl:[--reading-measure:52ch]" : "",
        )}
      >
        <div className="order-2 min-w-0 lg:order-none">{transcript}</div>
        <ReadingRail
          sections={sections}
          segments={segments}
          recording={recording}
          seek={seek}
          pipOpen={pipOpen}
          onTogglePip={() => setPipOpen((current) => !current)}
          onConsentGranted={onConsentGranted}
          onJumpToMoment={onJumpToMoment}
          onOpenSummaryTab={onOpenSummaryTab}
          speakerDirectory={speakerDirectory}
        />
      </div>
    </ReadingSyncProvider>
  );
}

function ReadingRail({
  sections,
  segments,
  recording,
  seek,
  pipOpen,
  onTogglePip,
  onConsentGranted,
  onJumpToMoment,
  onOpenSummaryTab,
  speakerDirectory,
}: {
  sections: readonly MeetingSummarySectionView[] | null;
  segments: readonly TranscriptSegmentDto[];
  recording: RoomHistoryArtifact | null;
  seek: SeekRequest | null;
  pipOpen: boolean;
  onTogglePip: () => void;
  onConsentGranted: () => void;
  onJumpToMoment: (atMs: number) => void;
  onOpenSummaryTab: () => void;
  speakerDirectory?: Readonly<
    Record<string, { fullName?: string | null; avatarUrl?: string | null }>
  >;
}) {
  const sync = useReadingSync();
  const [tab, setTab] = useState<RailTab>("summary");

  const claims = useMemo<RailClaim[]>(() => {
    const rows: Omit<RailClaim, "heading">[] = [];
    for (const section of sections ?? []) {
      section.items.forEach((item, index) => {
        if (item.atMs === null) return;
        rows.push({
          key: `${section.key}-${index}`,
          section: section.title,
          text: item.text,
          owner: item.owner,
          atMs: item.atMs,
        });
      });
    }
    // In meeting order, not template order. The rail is read down the page beside a transcript
    // that is also read down the page, and a summary whose items jump backwards and forwards
    // through the meeting makes the highlight appear to fly around at random while you scroll.
    rows.sort((left, right) => left.atMs - right.atMs);

    // The heading is decided HERE and not while rendering the list, because deciding it while
    // rendering means carrying "what was the last section" across iterations — a variable that
    // outlives the render it belongs to, which is the one thing a render must never do.
    //
    // Printed when the section CHANGES, the same rule the transcript's language chip follows and
    // for the same reason: ordering by when things were said means one section can be interrupted
    // by another and come back.
    return rows.map((row, index) => ({
      ...row,
      heading: row.section === rows[index - 1]?.section ? null : row.section,
    }));
  }, [sections]);

  const uncitedCount = useMemo(
    () =>
      (sections ?? []).reduce(
        (count, section) =>
          count + section.items.filter((item) => item.atMs === null).length,
        0,
      ),
    [sections],
  );

  /**
   * Which claims cover the block the reader is on.
   *
   * Built once per (claims, anchors) pair rather than asked per scroll frame — see
   * groupCitationsByAnchor. Going through the anchors rather than comparing milliseconds directly
   * is what makes a claim anchored to the pause BETWEEN two turns still light something up: the
   * rule for "which block does this moment belong to" lives in one function, and it is the same
   * function the jump uses.
   */
  const claimsByAnchor = useMemo(() => {
    const citations: ReadingCitation[] = claims.map((claim) => ({
      key: claim.key,
      atMs: claim.atMs,
    }));
    return groupCitationsByAnchor(citations, sync?.anchors ?? []);
  }, [claims, sync?.anchors]);

  const litKeys = sync?.readingKey ? (claimsByAnchor[sync.readingKey] ?? []) : [];

  /**
   * Who held the floor.
   *
   * Grouped through groupSavedTranscriptSegments first, which is what drops the control markers
   * (`__MEETING_END__` and friends) before anybody's speaking time is counted. Those carry a
   * speaker and a duration and would otherwise be attributed to whoever happened to be talking
   * when the meeting ended.
   */
  const shares = useMemo(
    () =>
      speakingShares(
        groupSavedTranscriptSegments(
          [...segments].sort((left, right) => left.sequenceOrder - right.sequenceOrder),
        ),
      ),
    [segments],
  );

  function markClaim(atMs: number | null) {
    if (!sync) return;
    sync.setMarkedKey(
      atMs === null ? null : (anchorForMs(sync.anchors, atMs)?.key ?? null),
    );
  }

  return (
    /* The rail is `print:hidden` in one place, here, rather than on each of its parts: on paper the
       transcript is the document and the summary is a different document. A record that printed
       both interleaved would be neither. */
    <aside className="order-1 flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-2 lg:order-none print:hidden">
      {recording ? (
        <div className="border-b border-border p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.09em] text-ink-subtle">
              <VideoCamera size={12} />
              Recording
            </span>
            <button
              type="button"
              onClick={onTogglePip}
              aria-expanded={pipOpen}
              title={
                pipOpen
                  ? "Hide the recording and widen the transcript"
                  : "Show the recording beside the transcript"
              }
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink"
            >
              {pipOpen ? "Hide" : "Show"}
              {pipOpen ? <CaretUp size={10} /> : <CaretDown size={10} />}
            </button>
          </div>
          {pipOpen ? (
            <MeetingRecordingPlayer
              variant="pip"
              artifact={recording}
              seek={seek}
              playbackRequest={sync?.playbackRequest ?? null}
              onConsentGranted={onConsentGranted}
            />
          ) : null}
        </div>
      ) : null}

      <div
        className="flex items-center gap-1 border-b border-border px-2"
        role="tablist"
        aria-label="Meeting summary rail"
      >
        <RailTabButton
          active={tab === "summary"}
          onClick={() => setTab("summary")}
          label="Summary"
          count={claims.length || undefined}
        />
        <RailTabButton
          active={tab === "attendees"}
          onClick={() => setTab("attendees")}
          label="Attendees"
          count={shares.length || undefined}
        />
      </div>

      {/* Scrolls independently of the transcript, which is the point of a rail: a summary that has
          to be scrolled past to reach the transcript is a header, not a rail. Scroll chaining is
          left at its default so reaching the end of this list carries on scrolling the page,
          exactly as WT-330(8) requires of every inner scroller on this route. */}
      <div className="max-h-[420px] min-h-[180px] overflow-y-auto p-2 xl:max-h-[560px]">
        {tab === "summary" ? (
          <RailSummary
            claims={claims}
            litKeys={litKeys}
            uncitedCount={uncitedCount}
            hasSummary={Boolean(sections?.length)}
            onMark={markClaim}
            onJumpToMoment={onJumpToMoment}
            onOpenSummaryTab={onOpenSummaryTab}
          />
        ) : (
          <RailAttendees shares={shares} speakerDirectory={speakerDirectory} />
        )}
      </div>
    </aside>
  );
}

function RailTabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[12px] font-medium transition-colors",
        active ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink",
      )}
    >
      {label}
      {typeof count === "number" ? (
        <span className="text-[10px] text-ink-subtle">({count})</span>
      ) : null}
    </button>
  );
}

function RailSummary({
  claims,
  litKeys,
  uncitedCount,
  hasSummary,
  onMark,
  onJumpToMoment,
  onOpenSummaryTab,
}: {
  claims: readonly RailClaim[];
  /** The claims covering the block being read right now. */
  litKeys: readonly string[];
  uncitedCount: number;
  hasSummary: boolean;
  onMark: (atMs: number | null) => void;
  onJumpToMoment: (atMs: number) => void;
  onOpenSummaryTab: () => void;
}) {
  if (claims.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-[12px] leading-5 text-ink-muted">
        {hasSummary
          ? "This summary was written before citations were recorded, so none of it can be traced back to the transcript. It is readable in full on the Summary tab."
          : "Nothing has been summarised for this meeting yet. The summary is written after a meeting ends and appears here on its own."}
      </p>
    );
  }

  return (
    <div>
      {claims.map((claim) => (
        <div key={claim.key}>
          {claim.heading ? (
            <h5 className="mb-1.5 mt-3 px-2 font-mono text-[10px] uppercase tracking-[0.09em] text-ink-subtle first:mt-0">
              {claim.heading}
            </h5>
          ) : null}
          <RailClaimButton
            claim={claim}
            lit={litKeys.includes(claim.key)}
            onMark={onMark}
            onJumpToMoment={onJumpToMoment}
          />
        </div>
      ))}

      {uncitedCount > 0 ? (
        <div className="mt-3 border-t border-border px-2 pt-2.5">
          <p className="text-[11px] leading-5 text-ink-muted">
            {uncitedCount} more {uncitedCount === 1 ? "point is" : "points are"} in this summary
            with no moment recorded, so {uncitedCount === 1 ? "it" : "they"} cannot be checked
            against the transcript from here.
          </p>
          <button
            type="button"
            onClick={onOpenSummaryTab}
            className="mt-1.5 rounded-md border border-border bg-surface-1 px-2 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-surface-2"
          >
            Read the whole summary
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RailClaimButton({
  claim,
  lit,
  onMark,
  onJumpToMoment,
}: {
  claim: RailClaim;
  lit: boolean;
  onMark: (atMs: number | null) => void;
  onJumpToMoment: (atMs: number) => void;
}) {
  return (
    <button
      type="button"
      // Focus as well as hover, in both directions. A keyboard reader tabbing down this rail is
      // doing exactly what a mouse reader is doing with the pointer, and a highlight that only
      // answers to a pointer is a highlight half the readers of this page never see.
      onMouseEnter={() => onMark(claim.atMs)}
      onMouseLeave={() => onMark(null)}
      onFocus={() => onMark(claim.atMs)}
      onBlur={() => onMark(null)}
      onClick={() => onJumpToMoment(claim.atMs)}
      title="Go to this moment in the transcript"
      className={cn(
        "mb-0.5 block w-full rounded-md border-l-2 px-2.5 py-2 text-left transition-colors",
        lit
          ? "border-l-primary bg-primary/10"
          : "border-l-transparent hover:border-l-primary hover:bg-surface-1",
      )}
    >
      <span className="block text-[12.5px] leading-[1.55] text-ink">
        {claim.owner ? <span className="font-medium">{claim.owner}: </span> : null}
        {claim.text}
      </span>
      <span
        className={cn(
          "mt-1 block font-mono text-[10px] tabular-nums transition-colors",
          lit ? "text-ink" : "text-ink-subtle",
        )}
      >
        {formatCitationTime(claim.atMs)}
      </span>
    </button>
  );
}

/**
 * Who talked, and for how long.
 *
 * There is no endpoint that answers this: attendance says who was in the room, which is a different
 * question, and the meeting where one person spoke for forty minutes looks identical to the one
 * five people shared in every roster the product has. The transcript is the only record of it —
 * see speakingShares.
 */
function RailAttendees({
  shares,
  speakerDirectory,
}: {
  shares: ReturnType<typeof speakingShares>;
  speakerDirectory?: Readonly<
    Record<string, { fullName?: string | null; avatarUrl?: string | null }>
  >;
}) {
  if (shares.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-[12px] leading-5 text-ink-muted">
        Nobody was recorded speaking in this meeting.
      </p>
    );
  }

  return (
    <div>
      <h5 className="mb-1.5 px-2 font-mono text-[10px] uppercase tracking-[0.09em] text-ink-subtle">
        Share of the talking
      </h5>
      {shares.map((share) => {
        const speaker = resolveTranscriptSpeaker(share.key, share.name, speakerDirectory);
        return (
          <div
            key={share.key}
            className="grid grid-cols-[18px_minmax(0,1fr)_44px_30px] items-center gap-2 px-2 py-1.5"
          >
            <TranscriptSpeakerAvatar speaker={speaker} />
            <span className="min-w-0 truncate text-[12.5px] text-ink" title={speaker.name}>
              {speaker.name}
            </span>
            {/* The bar is the thing that is read at a glance and the number is the thing that is
                checked, so both are here — a bar alone cannot distinguish 4% from 6%, and a
                column of numbers alone does not show the shape of the meeting. */}
            <span
              className="h-1 overflow-hidden rounded-full bg-surface-1"
              role="img"
              aria-label={`${share.percent}% of the speaking`}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${share.percent}%`,
                  backgroundColor: speakerColorVar(speaker.id),
                }}
              />
            </span>
            <span className="text-right font-mono text-[10.5px] tabular-nums text-ink-subtle">
              {share.percent}%
            </span>
          </div>
        );
      })}
      <p className="mt-2 px-2 text-[10.5px] leading-4 text-ink-subtle">
        Measured from the transcript, so it counts time spent speaking rather than time spent in
        the meeting.
      </p>
    </div>
  );
}
