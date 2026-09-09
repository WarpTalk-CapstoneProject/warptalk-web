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
 * WHY A FIXED RAIL AND NOT HALF
 *   A summary is about fifteen lines and takes thirty seconds to read. The transcript beside it is
 *   six hundred lines and takes ten minutes. Splitting the screen down the middle divides it by
 *   nominal importance; a fixed rail divides it by how much reading each side actually holds, which
 *   is the division that leaves both of them usable.
 *
 *   The number is 420px, and it started at 380px. It grew when the rail stopped being a filtered
 *   extract of the summary and began carrying every point of it, including the ones with no
 *   recorded moment — more to hold than the first number was chosen for. The principle did not
 *   move, and the principle is what check-reading-rail-contract.mjs pins.
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
  /**
   * When in the meeting this point was made, or null when the summary recorded no moment for it.
   *
   * Null used to mean "drop this row". That was wrong, and wrong in a way that was hard to see:
   * the rail stopped being the summary and became a filtered extract of it, and the only route to
   * the rest was a button that sent the reader to another tab. A summary you cannot finish reading
   * where you are is not beside the transcript at all. Every point renders now; the ones with no
   * moment simply do not offer a jump, and say so.
   */
  atMs: number | null;
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
  /** Whether the recording is shown as a picture or folded away to its transport bar. */
  const [pipOpen, setPipOpen] = useState(true);

  return (
    <ReadingSyncProvider>
      <div
        className={cn(
          /* The three breakpoints, and they are three genuinely different layouts rather than one
             layout squeezed. ≥1280px: two regions, rail at 420px. 1024–1280px: rail at 360px and
             the pip collapsed to its transport bar (see MeetingRecordingPlayer's `pip` variant).
             <1024px: stacked, and the SUMMARY GOES FIRST — on a small screen people read the
             summary and then decide whether the transcript is worth their next ten minutes, so
             putting the transcript above it buries the thing that answers that question. */
          "grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]",
          /* The measure is declared HERE, on the ancestor of both regions, because it is a fact
             about the pair rather than about either column.
             It is 66ch and it stays 66ch. It used to drop to 52ch whenever the pip was showing,
             on the theory that somebody glancing between picture and text reads in shorter
             bursts — but the pip shows BY DEFAULT, so the default state was the narrowest one,
             and 52ch of text sitting in a 940px column read as a broken layout rather than as a
             considered measure. The reading width should not move because a video thumbnail is
             on screen; if a genuine compare mode arrives later, that mode can own the change. */
          "[--reading-measure:66ch]",
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

  /**
   * The whole summary, in the summary's own order.
   *
   * Two earlier decisions are reversed here, and both for the same reason. Uncited points were
   * skipped, and the survivors were re-sorted into meeting order. Each was defensible alone: a
   * point with no moment cannot be checked, and a list that jumps back and forth makes the
   * highlight appear to fly around while you scroll. Together they turned the rail into a filtered,
   * reordered extract that no longer matched the summary anyone had read on the Summary tab — the
   * reader was left pressing "Read the whole summary" to see the document they thought they were
   * already looking at.
   *
   * So: every point, in the order the summary itself puts them, grouped under their own section
   * headings. Sync is unaffected — it keys off the points that DO carry a moment, and the ones
   * that do not simply never light up, which is the honest rendering of a claim with no source.
   */
  const claims = useMemo<RailClaim[]>(() => {
    const rows: RailClaim[] = [];
    for (const section of sections ?? []) {
      section.items.forEach((item, index) => {
        rows.push({
          key: `${section.key}-${index}`,
          section: section.title,
          // Printed when the section CHANGES rather than on every row, the same rule the
          // transcript's language chip follows.
          heading: index === 0 ? section.title : null,
          text: item.text,
          owner: item.owner,
          atMs: item.atMs,
        });
      });
    }
    return rows;
  }, [sections]);

  const uncitedCount = useMemo(
    () => claims.filter((claim) => claim.atMs === null).length,
    [claims],
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
    // Only the points that carry a moment take part. A point with no moment is still rendered —
    // it is part of the summary — but there is no block for it to light up, and inventing one
    // would be the same lie as inventing the citation.
    const citations: ReadingCitation[] = claims
      .filter((claim): claim is RailClaim & { atMs: number } => claim.atMs !== null)
      .map((claim) => ({ key: claim.key, atMs: claim.atMs }));
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

      {/* A footnote about the summary as a whole, not a door out of it. Every point above is
          readable here; this only says how much of it the transcript can vouch for. The Summary
          tab is still offered because it carries what the rail does not — the download and the
          rewrite controls — but nobody has to go there to finish reading. */}
      {uncitedCount > 0 ? (
        <div className="mt-3 border-t border-border px-2 pt-2.5">
          <p className="text-[11px] leading-5 text-ink-muted">
            {uncitedCount} of these {uncitedCount === 1 ? "points has" : "points have"} no moment
            recorded, so {uncitedCount === 1 ? "it" : "they"} cannot be checked against the
            transcript.{" "}
            <button
              type="button"
              onClick={onOpenSummaryTab}
              className="underline underline-offset-2 transition-colors hover:text-ink"
            >
              Open the Summary tab
            </button>
          </p>
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
  const body = (
    <>
      <span className="block text-[12.5px] leading-[1.55] text-ink">
        {claim.owner ? <span className="font-medium">{claim.owner}: </span> : null}
        {claim.text}
      </span>
      <span
        className={cn(
          "mt-1 block font-mono text-[10px] tabular-nums transition-colors",
          claim.atMs === null ? "text-ink-subtle" : lit ? "text-ink" : "text-ink-subtle",
        )}
      >
        {claim.atMs === null ? "no moment recorded" : formatCitationTime(claim.atMs)}
      </span>
    </>
  );

  /* A point with no moment is text, not a control. Rendering it as a button that looks like every
     other one and then does nothing on click is worse than not offering the affordance: the
     reader learns the rail is unreliable rather than learning this particular claim is
     unsourced. */
  if (claim.atMs === null) {
    return (
      <div className="mb-0.5 block w-full rounded-md border-l-2 border-l-transparent px-2.5 py-2 text-left">
        {body}
      </div>
    );
  }

  const atMs = claim.atMs;
  return (
    <button
      type="button"
      // Focus as well as hover, in both directions. A keyboard reader tabbing down this rail is
      // doing exactly what a mouse reader is doing with the pointer, and a highlight that only
      // answers to a pointer is a highlight half the readers of this page never see.
      onMouseEnter={() => onMark(atMs)}
      onMouseLeave={() => onMark(null)}
      onFocus={() => onMark(atMs)}
      onBlur={() => onMark(null)}
      onClick={() => onJumpToMoment(atMs)}
      title="Go to this moment in the transcript"
      className={cn(
        "mb-0.5 block w-full rounded-md border-l-2 px-2.5 py-2 text-left transition-colors",
        lit
          ? "border-l-primary bg-primary/10"
          : "border-l-transparent hover:border-l-primary hover:bg-surface-1",
      )}
    >
      {body}
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
