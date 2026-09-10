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
 *
 * WHY THE OVERVIEW IS A SECTION NOW
 *   That argument had one exemption, and it was the largest block on the panel: the overview
 *   paragraph, printed as flat text with no moment behind any of it and read first by everybody.
 *   The traceable template removes the exemption by emitting the overview as `narrative` — the same
 *   prose, cut into sentences that each carry their own moments. It is drawn as prose rather than
 *   as rows (see RailNarrativeSentence), because the point is to keep it readable as a paragraph
 *   while making every sentence of it answerable.
 */

import { useMemo, useState } from "react";
import {
  CaretDown,
  CaretUp,
  ChatCircleText,
  Copy,
  DownloadSimple,
  SpinnerGap,
  VideoCamera,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import {
  MeetingRecordingPlayer,
  SummaryStalenessNotice,
  useRecentlyEnded,
  type SeekRequest,
} from "@/components/rooms/meeting-record-panels";
import {
  ReadingSyncProvider,
  useReadingSync,
} from "@/components/rooms/transcript-reading-sync";
import { TranscriptSpeakerAvatar } from "@/components/rooms/transcript-speaker-avatar";
import { languagesInScope } from "@/lib/language/languages";
import {
  DEFAULT_SUMMARY_TEMPLATE,
  SUMMARY_TEMPLATES,
  formatCitationTime,
} from "@/lib/meeting/meeting-summary";
import {
  describeSummaryAbsence,
  summaryAbsenceMessage,
} from "@/lib/meeting/summary-absence";
import { resolveSummaryState } from "@/lib/meeting/room-history-mapping";
import { isSummaryStale, type StalenessSegment } from "@/lib/meeting/summary-staleness";
import {
  anchorForMs,
  groupCitationsByAnchor,
  speakingShares,
  type ReadingCitation,
} from "@/lib/transcript/document-reading";
import { resolveTranscriptSpeaker, speakerColorVar } from "@/lib/transcript/speaker-color";
import { groupSavedTranscriptSegments } from "@/lib/transcript/transcript-display";
import { cn } from "@/lib/utils";
import type { SeekSources } from "@/lib/meeting/recording-seek";
import type { EndedRoomHistoryItem, RoomHistoryArtifact } from "@/types/roomHistory";
import type { TranscriptSegmentDto } from "@/types/transcript";
import type {
  MeetingSummaryContent,
  SummaryRenderingView,
} from "@/types/meetingSummary";

/**
 * The traceable template's prose section.
 *
 * Every other section of every other template is a list of separate points, and a row apiece is
 * the right shape for those. This one is a paragraph that happens to arrive as sentences, and a
 * paragraph rendered as rows stops being a paragraph — so it is the one key this file branches on.
 */
const NARRATIVE_SECTION_KEY = "narrative";

/** One line of the rail, and the moment in the meeting it is answerable to. */
type RailClaim = {
  key: string;
  /** The summary's own key for the section, which decides how the point is drawn. */
  sectionKey: string;
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
  /**
   * The rest of the moments the point rests on — empty for a point that rests on one turn.
   *
   * A sentence that summarises an exchange came from several turns by several speakers, and one
   * of them cannot stand for the others: marking only `atMs` leaves the reply unlit while the
   * reader is looking straight at it, which reads as the summary having lost interest.
   */
  alsoAtMs: readonly number[];
};

/**
 * The rail's two tabs.
 *
 * The second one was called "attendees" and labelled "Attendees", which promised a roster and
 * delivered something else: it is built from `speakingShares`, so it lists only the people the
 * transcript caught talking, ranks them by how much, and says "Nobody was recorded speaking in
 * this meeting" when there is no transcript to read it from. Somebody who sat through the whole
 * hour without a word did not appear in it. RailTalkTime's own comment had this right all along —
 * "attendance says who was in the room, which is a different question" — and the name now agrees
 * with it. The actual roster lives in the page's People panel, 300px away, which is exactly why
 * the two must not share a word.
 */
type RailTab = "summary" | "talk";

export function TranscriptReadingLayout({
  transcript,
  record,
  segments,
  hasTranscript,
  recording,
  recordingUnavailableReason,
  seek,
  seekSources,
  busyArtifactId,
  onConsentGranted,
  onDurationSeconds,
  onJumpToMoment,
  onDownload,
  onRewrite,
  rendering,
  onSelectRendering,
  speakerDirectory,
}: {
  /** Built by the room page — see the note in transcript-reading-sync.tsx on why it arrives whole. */
  transcript: React.ReactNode;
  /**
   * The whole ended record, because the rail now holds the whole summary.
   *
   * It used to take `sections` alone, which was all a list of citations needed. The summary had
   * its own tab for everything else — the overview paragraph, the shape picker, Copy, Download,
   * and the four different reasons a summary can be absent. That tab is gone: it was a second
   * place to read the same summary, one click away from the transcript it is about, and a reader
   * who wanted both had to keep swapping. So the rail takes the record and renders all of it.
   */
  record: EndedRoomHistoryItem | null;
  /** The persisted transcript, for the talk-time tab. Control markers are dropped here, not by
   *  the caller — see the note on `shares`. */
  segments: readonly TranscriptSegmentDto[];
  /** Whether the meeting captured any transcript at all, once the page knows. `undefined` means
   *  "not loaded yet" and nothing is concluded from it. */
  hasTranscript?: boolean;
  recording: RoomHistoryArtifact | null;
  /** Why nothing is playable, when the meeting did record something. See MeetingRecordingPlayer. */
  recordingUnavailableReason?: "processing" | "multiple" | null;
  seek: SeekRequest | null;
  /**
   * WT-655 — the two origins that turn the recording's playhead into a moment in the meeting.
   *
   * Forwarded to ReadingSyncProvider and used nowhere in this file: it is passed through because the
   * provider is mounted here, not because the rail has any business with it. The room page builds
   * the value once and both directions of the conversion read the same object.
   */
  seekSources?: SeekSources;
  busyArtifactId?: string | null;
  onConsentGranted: () => void;
  /**
   * WT-655 — the recording's own length, back UP to the page.
   *
   * Not routed through ReadingSyncProvider like the playhead is, and the asymmetry is the point:
   * the playhead is consumed inside the provider, whereas the duration's only consumer is the
   * `seekSources` the page builds and hands back DOWN to that provider. Publishing it into the
   * context would be asking the provider to feed its own input.
   */
  onDurationSeconds?: (seconds: number | null) => void;
  onJumpToMoment: (atMs: number, alsoAtMs?: readonly number[]) => void;
  onDownload?: (artifact: RoomHistoryArtifact) => void;
  /** Ask for the summary to be rewritten in another shape, another language, or both.
   *  Omit to hide the pickers. */
  onRewrite?: (templateKey: string, language?: string) => Promise<void>;
  /**
   * The (shape, language) being READ right now, when it is not the one the host published.
   * Null means "show what the host published", which is what every reader starts on.
   */
  rendering?: SummaryRenderingView | null;
  /** Ask to read another pair. Never rewrites the meeting's summary — see RailSummary. */
  onSelectRendering?: (templateKey: string, language: string) => void;
  speakerDirectory?: Readonly<
    Record<string, { fullName?: string | null; avatarUrl?: string | null }>
  >;
}) {
  /** Whether the recording is shown as a picture or folded away to its transport bar. */
  const [pipOpen, setPipOpen] = useState(true);

  return (
    <ReadingSyncProvider seekSources={seekSources}>
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
          record={record}
          segments={segments}
          hasTranscript={hasTranscript}
          recording={recording}
          recordingUnavailableReason={recordingUnavailableReason}
          seek={seek}
          busyArtifactId={busyArtifactId ?? null}
          pipOpen={pipOpen}
          onTogglePip={() => setPipOpen((current) => !current)}
          onConsentGranted={onConsentGranted}
          onDurationSeconds={onDurationSeconds}
          onJumpToMoment={onJumpToMoment}
          onDownload={onDownload}
          onRewrite={onRewrite}
          rendering={rendering}
          onSelectRendering={onSelectRendering}
          speakerDirectory={speakerDirectory}
        />
      </div>
    </ReadingSyncProvider>
  );
}

function ReadingRail({
  record,
  segments,
  hasTranscript,
  recording,
  recordingUnavailableReason,
  seek,
  busyArtifactId,
  pipOpen,
  onTogglePip,
  onConsentGranted,
  onDurationSeconds,
  onJumpToMoment,
  onDownload,
  onRewrite,
  rendering,
  onSelectRendering,
  speakerDirectory,
}: {
  record: EndedRoomHistoryItem | null;
  segments: readonly TranscriptSegmentDto[];
  hasTranscript?: boolean;
  recording: RoomHistoryArtifact | null;
  /** Why there is nothing to play, when the meeting did record something. See MeetingRecordingPlayer. */
  recordingUnavailableReason?: "processing" | "multiple" | null;
  seek: SeekRequest | null;
  busyArtifactId: string | null;
  pipOpen: boolean;
  onTogglePip: () => void;
  onConsentGranted: () => void;
  /** Passed straight to the pip player. See TranscriptReadingLayout for why it does not travel
   *  through the sync context the playhead does. */
  onDurationSeconds?: (seconds: number | null) => void;
  onJumpToMoment: (atMs: number, alsoAtMs?: readonly number[]) => void;
  onDownload?: (artifact: RoomHistoryArtifact) => void;
  onRewrite?: (templateKey: string, language?: string) => Promise<void>;
  rendering?: SummaryRenderingView | null;
  onSelectRendering?: (templateKey: string, language: string) => void;
  speakerDirectory?: Readonly<
    Record<string, { fullName?: string | null; avatarUrl?: string | null }>
  >;
}) {
  const sync = useReadingSync();
  const [tab, setTab] = useState<RailTab>("summary");
  /**
   * WHAT IS ON SCREEN, which is not always what the host published.
   *
   * One substitution, here, because everything downstream derives from it: `sections` feeds the
   * claims, the claims feed the tab count and the transcript sync, and the panel reads the
   * summary again for its overview. Overriding inside the panel alone would light up moments
   * belonging to a summary nobody was looking at.
   *
   * A rendering still being written contributes nothing, so the published summary stays on
   * screen while the new one is generated. Blanking a perfectly good summary for a minute would
   * be a worse answer than showing the one that is already there.
   */
  const shownSummary =
    rendering?.status === "ready" && rendering.content ? rendering.content : record?.summary;
  const sections = shownSummary?.sections ?? null;

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
          sectionKey: section.key,
          section: section.title,
          // Printed when the section CHANGES rather than on every row, the same rule the
          // transcript's language chip follows.
          heading: index === 0 ? section.title : null,
          text: item.text,
          owner: item.owner,
          atMs: item.atMs,
          alsoAtMs: item.alsoAtMs,
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
    // Every moment travels, not just the primary one: the reverse direction is the one this map
    // is mostly read in, and a claim resting on two turns used to go dark the moment the reader
    // scrolled from the first to the second — which looks exactly like the summary running out.
    const citations: ReadingCitation[] = claims
      .filter((claim): claim is RailClaim & { atMs: number } => claim.atMs !== null)
      .map((claim) => ({ key: claim.key, atMs: claim.atMs, alsoAtMs: claim.alsoAtMs }));
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

  /**
   * Light every block the pointed-at claim rests on, and nothing else.
   *
   * `alsoAtMs` is optional so a point that rests on a single turn asks for it the way it always
   * has. The keys are a SET before they are published: several moments of one sentence commonly
   * land in the same turn, and a key published twice is one turn counted twice by anything
   * downstream that counts rather than merely tests membership.
   */
  function markClaim(atMs: number | null, alsoAtMs: readonly number[] = []) {
    if (!sync) return;
    if (atMs === null) {
      sync.setMarkedKeys([]);
      return;
    }

    const keys = new Set<string>();
    for (const moment of [atMs, ...alsoAtMs]) {
      const anchor = anchorForMs(sync.anchors, moment);
      if (anchor) keys.add(anchor.key);
    }
    sync.setMarkedKeys(Array.from(keys));
  }

  return (
    /* The rail is `print:hidden` in one place, here, rather than on each of its parts: on paper the
       transcript is the document and the summary is a different document. A record that printed
       both interleaved would be neither. */
    <aside className="order-1 flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-2 lg:order-none print:hidden">
      {/* WT-655: a recording that is still being processed has no playable artifact, so `recording`
          is null and this whole block used to vanish — indistinguishable from a meeting nobody
          recorded, for the reader most likely to be waiting on it. `"multiple"` deliberately does
          NOT open this block: the transcript tab already carries a line explaining that case, and
          saying it twice on one screen reads as two different problems. */}
      {recording || recordingUnavailableReason === "processing" ? (
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
              unavailableReason={recordingUnavailableReason}
              seek={seek}
              playbackRequest={sync?.playbackRequest ?? null}
              /* WT-655 — the wire the transcript follows the recording along. Handed the context's
                 own functions rather than arrows closing over them: the player retracts the
                 highlight when these change identity (see its unmount cleanup), so an inline
                 lambda here would clear the playhead on every render of this rail. */
              onPlaybackSeconds={sync?.publishPlaybackSeconds}
              onPlayingChange={sync?.publishPlaying}
              /* Stable for the same reason those two are: the player retracts the duration when
                 this changes identity, so an arrow declared here would report "length unknown" on
                 every render of the rail and disarm the past-the-end refusal. */
              onDurationSeconds={onDurationSeconds}
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
          active={tab === "talk"}
          onClick={() => setTab("talk")}
          label="Talk time"
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
            record={record}
            segments={segments}
            hasTranscript={hasTranscript}
            busyArtifactId={busyArtifactId}
            claims={claims}
            litKeys={litKeys}
            uncitedCount={uncitedCount}
            onMark={markClaim}
            onJumpToMoment={onJumpToMoment}
            onDownload={onDownload}
            onRewrite={onRewrite}
            shownSummary={shownSummary}
            rendering={rendering}
            onSelectRendering={onSelectRendering}
          />
        ) : (
          <RailTalkTime shares={shares} speakerDirectory={speakerDirectory} />
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

/**
 * The whole summary, in the rail — overview, points, controls and every reason there is none.
 *
 * This used to be the citation list and nothing else, with a button sending the reader to a
 * Summary tab for the rest. Two places to read one summary is one too many when the second is a
 * click away from the transcript the summary is about: the reader ended up bouncing between them
 * to check a claim, and the rail's whole argument — that a summary has a source you can see —
 * only works while both are on screen at once.
 *
 * So everything the tab carried is here. The controls are a single compact row rather than a
 * panel header, because at 420px a header that wraps costs more than the reading it protects.
 */
function RailSummary({
  record,
  segments,
  hasTranscript,
  busyArtifactId,
  claims,
  litKeys,
  uncitedCount,
  onMark,
  onJumpToMoment,
  onDownload,
  onRewrite,
  shownSummary,
  rendering,
  onSelectRendering,
}: {
  record: EndedRoomHistoryItem | null;
  segments: readonly StalenessSegment[];
  hasTranscript?: boolean;
  busyArtifactId: string | null;
  claims: readonly RailClaim[];
  /** The claims covering the block being read right now. */
  litKeys: readonly string[];
  uncitedCount: number;
  /** Mark the blocks a claim rests on, or clear with a null. See markClaim. */
  onMark: (atMs: number | null, alsoAtMs?: readonly number[]) => void;
  onJumpToMoment: (atMs: number, alsoAtMs?: readonly number[]) => void;
  onDownload?: (artifact: RoomHistoryArtifact) => void;
  onRewrite?: (templateKey: string, language?: string) => Promise<void>;
  shownSummary?: MeetingSummaryContent | null;
  rendering?: SummaryRenderingView | null;
  onSelectRendering?: (templateKey: string, language: string) => void;
}) {
  // The pair being READ, which the mid component already resolved: the published summary
  // unless a rendering is ready. Passed in rather than re-derived so the panel and the claims
  // beside it can never disagree about which summary is on screen.
  const summary = shownSummary;
  const artifact = record?.artifacts.find((item) => item.type === "summary_export");
  const ready = artifact?.status === "ready";
  const downloading = busyArtifactId !== null && busyArtifactId === artifact?.id;
  // `sections` counts as content in its own right. A traceable summary can put every word it has
  // into `narrative` and leave the flat overview string empty, and judging emptiness on the three
  // pre-template fields alone would answer "No summary yet" over a summary that is right there.
  const hasContent = Boolean(
    summary
      && !summary.insufficientData
      && (summary.summary
        || summary.decisions.length
        || summary.actionItems.length
        || claims.length),
  );
  const recentlyEnded = useRecentlyEnded(record?.endedAt);

  const summaryState = resolveSummaryState({
    artifactStatus: artifact?.status,
    hasStructuredContent: hasContent,
    insufficientData: summary?.insufficientData,
    recentlyEnded,
    hasTranscript,
  });
  const isGenerating = summaryState === "generating";

  // "Not shared with you" is not "does not exist": room artifacts default to HOST_ONLY and the
  // history projection omits `content` for anyone the policy refuses while still listing the row.
  const absence = describeSummaryAbsence({
    isGenerating,
    summaryState,
    hasSummaryArtifact: Boolean(artifact),
    hasParsedSummary: Boolean(summary),
    insufficientData: summary?.insufficientData,
    hasTranscript,
  });

  // The pair on screen. `rendering` wins even while it is generating, so the picker keeps
  // showing what was asked for instead of snapping back to the published pair for a minute —
  // which is what made the old picker read as "nothing happened".
  const currentTemplate =
    rendering?.templateKey ?? summary?.templateKey ?? DEFAULT_SUMMARY_TEMPLATE;
  // Read off the claims rather than off the template key: a summary rewritten into another shape
  // arrives before its templateKey does, and the sections are what is actually being rendered.
  const hasNarrative = claims.some((claim) => claim.sectionKey === NARRATIVE_SECTION_KEY);
  /**
   * The language this summary was written in, or "" for one written before anybody could
   * choose. Empty is a real answer and not a missing one — it says the model followed the
   * transcript — so it is offered as its own option rather than being filled in with a guess
   * about what the text looks like.
   */
  const currentLanguage = rendering?.language ?? summary?.summaryLanguage ?? "";
  // Derived, never stored. See summary-staleness.ts for why a flag would end up lying.
  const stale = isSummaryStale(segments, artifact);
  /**
   * What was asked for, as a PAIR.
   *
   * This tracked the shape alone, which stopped being enough the moment language became a
   * second thing a rewrite can change: asking for the same shape in Japanese left the
   * requested and current templates identical, so the picker read as "nothing is happening"
   * while a rewrite was in flight — no spinner, no lock, and a second click would queue a
   * duplicate.
   */
  const [regenerating, setRegenerating] = useState(false);

  /**
   * Waiting for a rendering, which is no longer the same event as rewriting the meeting.
   *
   * The picker used to POST a rewrite, so choosing Japanese REPLACED the room's summary and the
   * rail had to run its own 90-second deadline against an artifact that might never change.
   * Now it asks to read a pair, the page owns the polling and the deadline, and this is simply
   * whether that read has landed.
   */
  const isRendering = rendering?.status === "generating";

  /**
   * Every language the product can translate into, not only the ones this meeting produced.
   *
   * The same rule the transcript picker follows, and for the same reason: a summary is
   * rewritten from the transcript on demand, so a language this meeting never touched is an
   * offer rather than a dead end. "As spoken" is listed only when that is what the current
   * summary actually is — offering it against a summary already written in a chosen language
   * would be offering to un-choose, which no request can express.
   */
  const languageOptions = useMemo(() => {
    const offered = languagesInScope("chatTarget").map((language) => ({
      code: language.code,
      label: language.name,
    }));
    return currentLanguage
      ? offered
      : [{ code: "", label: "As spoken" }, ...offered];
  }, [currentLanguage]);

  function selectRendering(template: string, language: string) {
    // Reading, not rewriting: nobody else's summary changes. The deadline and the polling live
    // with the caller, which is the only place that knows whether a refetch is still in flight.
    onSelectRendering?.(template, language);
  }

  async function copyAsText() {
    if (!summary || !record) return;
    const lines = [
      `${record.title} — AI meeting summary`,
      "",
      // The same substitution the panel makes: a summary whose narrative IS the overview would
      // otherwise be pasted with its opening paragraph printed twice.
      ...(hasNarrative ? [] : [summary.summary || "(no overview)", ""]),
      ...(summary.sections ?? []).flatMap((section) => [
        section.title,
        ...(section.items.length
          ? section.items.map((item) => `- ${item.owner ? `${item.owner}: ` : ""}${item.text}`)
          : ["(none recorded)"]),
        "",
      ]),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Summary copied.");
    } catch {
      toast.error("Could not copy the summary.");
    }
  }

  if (!hasContent) {
    return (
      <div className="px-2 py-8 text-center">
        {isGenerating ? (
          <SpinnerGap size={22} className="mx-auto animate-spin text-ink-muted" />
        ) : (
          <ChatCircleText size={22} className="mx-auto text-ink-muted" />
        )}
        <h5 className="mt-3 text-[13px] font-semibold text-ink">
          {isGenerating
            ? "Generating summary…"
            : absence === "withheld"
              ? "Summary not shared with you"
              : absence === "no-transcript"
                ? "Nothing was said to summarise"
                : "No summary yet"}
        </h5>
        <p className="mt-1.5 text-[11.5px] leading-5 text-ink-muted">
          {summaryAbsenceMessage(absence)}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* One row, and it is the summary's own controls rather than the record's: the shape it
          was written in, the language it was written in, a copy of it, and the file it was
          written to. Shape and language sit side by side because they are the same kind of
          decision — both are judgements only a reader of the finished meeting can make.

          They now READ rather than rewrite. Choosing a language used to replace the room's one
          summary artifact, so a Japanese attendee reading a shared meeting took the host's
          English summary away from everybody until the host pressed the button again. The pair
          somebody picks here is theirs; changing what the meeting's summary IS lives on the
          out-of-date notice below, which is the one control that means it. */}
      <div className="mb-1 flex items-center gap-1.5 border-b border-border pb-2">
        {onSelectRendering ? (
          <>
            <select
              value={currentTemplate}
              disabled={isRendering}
              onChange={(event) => {
                const templateKey = event.target.value;
                if (templateKey === currentTemplate) return;
                selectRendering(templateKey, currentLanguage);
              }}
              aria-label="Summary shape"
              title="Read this meeting in a different shape"
              className="h-6 min-w-0 flex-1 rounded border border-border bg-surface-1 px-1 text-[10px] text-ink disabled:opacity-60"
            >
              {SUMMARY_TEMPLATES.map((template) => (
                <option key={template.key} value={template.key} title={template.description}>
                  {template.label}
                </option>
              ))}
            </select>
            <select
              value={currentLanguage}
              disabled={isRendering}
              onChange={(event) => {
                const language = event.target.value;
                if (language === currentLanguage) return;
                selectRendering(currentTemplate, language);
              }}
              aria-label="Summary language"
              title="Read this meeting in a different language"
              className="h-6 min-w-0 flex-1 rounded border border-border bg-surface-1 px-1 text-[10px] text-ink disabled:opacity-60"
            >
              {languageOptions.map((language) => (
                <option key={language.code || "as-spoken"} value={language.code}>
                  {language.label}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {isRendering ? (
          <SpinnerGap size={12} className="animate-spin text-ink-subtle" />
        ) : null}
        <button
          type="button"
          onClick={copyAsText}
          title="Copy the summary as text"
          aria-label="Copy the summary as text"
          className="flex size-6 shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink"
        >
          <Copy size={13} />
        </button>
        {/* WT-369: offered only when there is a summary to download. The artifact ROW existing is
            not the summary existing — the finalizer writes one even when the AI produced nothing. */}
        {artifact && summaryState === "ready" && onDownload ? (
          <button
            type="button"
            onClick={() => onDownload(artifact)}
            disabled={!ready || downloading}
            title="Download the summary file"
            aria-label="Download the summary file"
            className="flex size-6 shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface-1 hover:text-ink disabled:opacity-60"
          >
            {downloading ? (
              <SpinnerGap size={13} className="animate-spin" />
            ) : (
              <DownloadSimple size={13} />
            )}
          </button>
        ) : null}
      </div>

      {/* WHOSE SUMMARY THIS IS. A rendering reads identically to the published summary, so
          without saying so a reader cannot tell whether what they are looking at is the record
          of the meeting or a translation they asked for a moment ago — and the download button
          beside it only ever serves the published one. */}
      {rendering && !rendering.isCanonical ? (
        <p className="border-b border-border px-2 pb-2 pt-1.5 text-[11px] leading-4 text-ink-muted">
          {isRendering
            ? "Writing this version for you…"
            : "Your own version of this meeting. What the host published is unchanged."}
        </p>
      ) : null}

      {stale && onRewrite ? (
        <div className="px-1 pt-2">
          <SummaryStalenessNotice
            busy={regenerating}
            onRegenerate={async () => {
              setRegenerating(true);
              try {
                // The PUBLISHED pair, not whatever pair is on screen. This is the one control
                // that changes the meeting's summary for everybody, and it exists because the
                // transcript moved on — not because the reader picked a language. Rewriting into
                // the reader's pair would quietly publish their private choice to the room.
                await onRewrite(
                  summary?.templateKey ?? DEFAULT_SUMMARY_TEMPLATE,
                  summary?.summaryLanguage || undefined,
                );
              } catch {
                // Swallowed HERE and only here: the page has already shown the server's own
                // sentence. Letting it escape would surface a second, generic error beside it.
              } finally {
                // Cleared when the REQUEST is accepted, not when the summary lands.
                setRegenerating(false);
              }
            }}
          />
        </div>
      ) : null}

      {/* The overview, which the rail did not carry at all while the Summary tab existed — the
          reader got the citable points and not the paragraph that says what the meeting was.

          It gives way to the narrative section when there is one. Both are the same prose, and
          only the narrative version can be checked: printing the flat string above a citable copy
          of itself would put the unverifiable one first and largest, which is precisely the dead
          spot the narrative exists to remove. */}
      {summary?.summary && !hasNarrative ? (
        <p className="border-b border-border px-2 pb-2.5 pt-2 text-[12.5px] leading-[1.55] text-ink">
          {summary.summary}
        </p>
      ) : null}

      {claims.length === 0 ? (
        <p className="px-2 py-6 text-center text-[12px] leading-5 text-ink-muted">
          This summary was written before citations were recorded, so none of its points can be
          traced back to the transcript.
        </p>
      ) : (
        claims.map((claim) => (
          <div key={claim.key}>
            {claim.heading ? (
              <h5 className="mb-1.5 mt-3 px-2 font-mono text-[10px] uppercase tracking-[0.09em] text-ink-subtle first:mt-0">
                {claim.heading}
              </h5>
            ) : null}
            {/* Said once under the heading rather than on every sentence. It stands in for the
                timestamp line the sentences do not carry, and a hint repeated beside six
                consecutive sentences is the same striped table the timestamps would have been. */}
            {claim.heading && claim.sectionKey === NARRATIVE_SECTION_KEY ? (
              <p className="mb-1 px-2.5 text-[10.5px] leading-4 text-ink-subtle">
                Click a sentence to see where it came from.
              </p>
            ) : null}
            {claim.sectionKey === NARRATIVE_SECTION_KEY ? (
              <RailNarrativeSentence
                claim={claim}
                lit={litKeys.includes(claim.key)}
                onMark={onMark}
                onJumpToMoment={onJumpToMoment}
              />
            ) : (
              <RailClaimButton
                claim={claim}
                lit={litKeys.includes(claim.key)}
                onMark={onMark}
                onJumpToMoment={onJumpToMoment}
              />
            )}
          </div>
        ))
      )}

      {/* A footnote about the summary as a whole. Every point above is readable here; this only
          says how much of it the transcript can vouch for. It no longer offers a way out to
          another tab, because there is no longer another tab to go to. */}
      {uncitedCount > 0 ? (
        <div className="mt-3 border-t border-border px-2 pt-2.5">
          <p className="text-[11px] leading-5 text-ink-muted">
            {uncitedCount} of these {uncitedCount === 1 ? "points has" : "points have"} no moment
            recorded, so {uncitedCount === 1 ? "it" : "they"} cannot be checked against the
            transcript.
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
  onJumpToMoment: (atMs: number, alsoAtMs?: readonly number[]) => void;
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
 * One sentence of the narrative, and the moments underneath it.
 *
 * WHY THIS IS NOT RailClaimButton
 *   A decision is a row: one statement, one moment, and a timestamp printed under it earns its
 *   line because the reader is scanning a list and wants the time. The narrative is a paragraph
 *   that happens to have arrived as sentences, and six sentences each with a mono timestamp line
 *   of their own is not a paragraph any more — it is a striped table, which is exactly what the
 *   mockup that tried rules between the sentences produced. So: the same bounded region as the
 *   button, stacked tight enough to still read as continuous prose, and no timestamp line.
 *
 * WHAT REPLACES THE TIMESTAMP LINE
 *   That line was the only thing telling a reader at rest that these words are clickable, so
 *   dropping it has to be paid for three times over: the left bar is faintly visible instead of
 *   transparent, the section says once underneath its heading that a sentence can be clicked, and
 *   the moments themselves appear at the right edge on hover and on focus. The last one is
 *   `opacity-0` rather than unmounted — a paragraph that reflows as the pointer crosses it is a
 *   paragraph nobody can read while pointing at it.
 *
 * A SENTENCE WITH NO MOMENT KEEPS NO BAR
 *   Same argument as the button above, one step earlier: the bar IS the affordance here, so its
 *   absence says "this one has no source" before the reader spends a click finding out. Only the
 *   2px it occupies stays, so the unsourced sentence still lines up with the rest of the prose.
 */
function RailNarrativeSentence({
  claim,
  lit,
  onMark,
  onJumpToMoment,
}: {
  claim: RailClaim;
  lit: boolean;
  onMark: (atMs: number | null, alsoAtMs?: readonly number[]) => void;
  onJumpToMoment: (atMs: number, alsoAtMs?: readonly number[]) => void;
}) {
  if (claim.atMs === null) {
    return (
      <p className="mb-px block w-full rounded-md border-l-2 border-l-transparent px-2.5 py-1 text-left text-[12.5px] leading-[1.55] text-ink">
        {claim.owner ? <span className="font-medium">{claim.owner}: </span> : null}
        {claim.text}
      </p>
    );
  }

  const atMs = claim.atMs;
  // Through a Set because the primary moment can also appear among the others, and a reader
  // stepping along "0:11 · 0:11 · 0:28" would read the repeat as two pieces of evidence.
  const moments = Array.from(new Set([atMs, ...claim.alsoAtMs])).sort(
    (left, right) => left - right,
  );

  return (
    <button
      type="button"
      // Focus as well as hover, in both directions — the same rule as the claim button, and for
      // the same reason: a highlight only a pointer can reach is a highlight half the readers of
      // this page never see.
      onMouseEnter={() => onMark(atMs, claim.alsoAtMs)}
      onMouseLeave={() => onMark(null)}
      onFocus={() => onMark(atMs, claim.alsoAtMs)}
      onBlur={() => onMark(null)}
      onClick={() => onJumpToMoment(atMs, claim.alsoAtMs)}
      title="Go to where this sentence came from"
      className={cn(
        "group mb-px flex w-full items-baseline gap-2 rounded-md border-l-2 px-2.5 py-1 text-left transition-colors",
        lit
          ? "border-l-primary bg-primary/10"
          : "border-l-primary/20 hover:border-l-primary hover:bg-surface-1",
      )}
    >
      <span className="min-w-0 flex-1 text-[12.5px] leading-[1.55] text-ink">
        {claim.owner ? <span className="font-medium">{claim.owner}: </span> : null}
        {claim.text}
      </span>
      {/* Held in the layout at rest, never unmounted. `lit` is the reverse direction — the reader
          is already reading the turn this came from, and offering to take them there would be
          offering to take them where they are. */}
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] tabular-nums text-ink-subtle transition-opacity",
          lit ? "opacity-0" : "opacity-0 group-hover:opacity-100 group-focus:opacity-100",
        )}
      >
        <span aria-hidden="true">↗ </span>
        {moments.map((moment) => formatCitationTime(moment)).join(" · ")}
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
function RailTalkTime({
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
