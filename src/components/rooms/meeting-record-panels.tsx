"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  ArrowsClockwise,
  ChatCircleText,
  CheckCircle,
  CheckSquare,
  Copy,
  DownloadSimple,
  Play,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/api/errors";
import {
  ARTIFACT_WITHHELD_FALLBACK,
  isArtifactWithheld,
} from "@/lib/meeting/artifact-denial";
import {
  describeSummaryAbsence,
  summaryAbsenceMessage,
} from "@/lib/meeting/summary-absence";
import { openArtifactDownload } from "@/lib/ui/download-artifact";
import { resolveSummaryState } from "@/lib/meeting/room-history-mapping";
import {
  artifactDownloadFormat,
  artifactLabel,
  artifactStatusLabel,
  canDownloadArtifact,
} from "@/lib/meeting/meeting-artifacts";
import {
  DEFAULT_SUMMARY_TEMPLATE,
  SUMMARY_TEMPLATES,
  formatCitationTime,
} from "@/lib/meeting/meeting-summary";
import { isSummaryStale, type StalenessSegment } from "@/lib/meeting/summary-staleness";
import { translationRoomService } from "@/services/translation-room.service";
import type {
  EndedRoomHistoryItem,
  RoomHistoryArtifact,
} from "@/types/roomHistory";

/**
 * The AI summary and the retained files for one meeting.
 *
 * These used to live on a separate Transcripts page, one level removed from the meeting they
 * describe: to read what a meeting decided you left the meeting's own page, found it again in
 * a workspace-wide queue, and picked a tab. A meeting's transcript, its summary and its files
 * are three views of one thing, so they now sit together on that meeting's page and this
 * component is what moved.
 */

/** A tab in the meeting record. Shared so the three tabs cannot drift apart visually. */
export function MeetingRecordTabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
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
        "flex h-10 items-center gap-1.5 border-b-2 px-3 text-[12px] font-medium transition-colors",
        active
          ? "border-ink text-ink"
          : "border-transparent text-ink-muted hover:text-ink",
      )}
    >
      <Icon size={14} />
      {label}
      {typeof count === "number" ? (
        <span className="text-[10px] text-ink-subtle">({count})</span>
      ) : null}
    </button>
  );
}

/**
 * Downloading an artifact, including the consent stop.
 *
 * Consent is asked for and recorded before the file is fetched, and the caller is told to
 * refetch afterwards so the row stops saying "Consent required" once it no longer is.
 */
export function useArtifactDownload(onConsentGranted?: () => void) {
  const [busyArtifactId, setBusyArtifactId] = useState<string | null>(null);

  async function downloadArtifact(artifact: RoomHistoryArtifact) {
    if (!canDownloadArtifact(artifact)) {
      toast.error("This file is not ready to download.");
      return;
    }

    setBusyArtifactId(artifact.id);
    try {
      if (artifact.consentRequired) {
        await translationRoomService.approveArtifactConsent(artifact.id);
      }
      const { data } = await translationRoomService.artifactDownload(
        artifact.id,
      );
      openArtifactDownload(data);
      if (artifact.consentRequired) onConsentGranted?.();
    } catch (error) {
      // A host-only artifact is withheld, not broken — the same distinction the history preview
      // and the Summary tab already draw. `error.message` was also the wrong source: on an axios
      // failure it is "Request failed with status code 403", never the server's own sentence.
      if (isArtifactWithheld(error)) {
        toast.info(getErrorMessage(error, ARTIFACT_WITHHELD_FALLBACK));
        return;
      }
      toast.error(getErrorMessage(error, "Could not download this file."));
    } finally {
      setBusyArtifactId(null);
    }
  }

  return { busyArtifactId, downloadArtifact };
}

/**
 * Watch the meeting back, above its transcript. WT-492.
 *
 * The recording was reachable only as a file to download, from the Artifacts tab — so "watch what
 * was said here" meant saving a video and leaving the page that has the transcript on it. The
 * artifact row itself was never missing; somewhere to play it was.
 *
 * The URL is fetched WHEN THE USER ASKS, not on mount. It is a short-lived link to object storage,
 * and spending one on every visit to a meeting page would mean most of them expire unwatched while
 * the page that holds them stays open. The click is also the natural place for the consent stop,
 * which is exactly how downloading already works — so consent is granted here by the same call,
 * and the caller refetches afterwards so the Artifacts row stops saying "Consent required" too.
 */
/**
 * A request to move the recording to a moment, carried as a value rather than a ref.
 *
 * `token` is what makes a REPEAT of the same second a new request: clicking the same transcript
 * line twice must seek twice (the viewer has since scrubbed away), and an effect keyed on seconds
 * alone would see no change and do nothing.
 */
export interface SeekRequest {
  seconds: number;
  token: number;
}

/**
 * What the media element's failure means for the person reading — the two cases that need
 * different sentences, not the four codes MediaError happens to define.
 *
 * `expired` IS NOT AN ERROR and must not be dressed as one. `sourceUrl` is a presigned link into
 * object storage with a fifteen-minute life, and a meeting record is a page people leave open
 * while they read a transcript — so a link that has stopped opening is the ordinary outcome of
 * reading for a quarter of an hour. Nobody made a mistake, nothing is broken, and there is nothing
 * to apologise for: the only honest response is to say the link aged out and hand over a new one.
 * Styling it as a fault would send the reader to the host, or to support, over a link doing exactly
 * what it was minted to do.
 *
 * `broken` is the other case: the bytes were reached and could not be played. A fresh link does
 * not fix that, so it does not offer one.
 */
type RecordingPlaybackFailure = "expired" | "broken";

/**
 * Read the media element's own verdict on why it went black.
 *
 * MEDIA_ERR_NETWORK is what a browser reports when the transfer dies part-way through, and
 * MEDIA_ERR_SRC_NOT_SUPPORTED is what it reports when the src answers 403/404 — an expired
 * presigned link produces one or the other depending on how far playback had got, and MediaError
 * exposes no HTTP status, so from in here the two genuinely cannot be told apart. They do not need
 * to be: a fresh link is the answer to both. MEDIA_ERR_DECODE means the file itself is unplayable,
 * which is a different sentence. MEDIA_ERR_ABORTED means playback was stopped deliberately — not a
 * failure, and nothing to report at all, hence `null`.
 *
 * A missing MediaError is treated as `broken`: something failed and we cannot say the link aged
 * out, so we do not claim it did.
 */
function classifyPlaybackFailure(
  error: MediaError | null,
): RecordingPlaybackFailure | null {
  if (!error) return "broken";
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return null;
    case MediaError.MEDIA_ERR_NETWORK:
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "expired";
    default:
      return "broken";
  }
}

export function MeetingRecordingPlayer({
  artifact,
  onConsentGranted,
  seek,
  playbackRequest,
  onPlaybackSeconds,
  onPlayingChange,
  onDurationSeconds,
  unavailableReason,
  variant = "section",
}: {
  artifact: RoomHistoryArtifact | null;
  onConsentGranted?: () => void;
  /** Move to a moment. Ignored when the caller could not align the two clocks — see
   *  recording-seek.ts, where an unalignable meeting yields no request at all. */
  seek?: SeekRequest | null;
  /**
   * Somebody pressed Space over the reading surface. A token, for the same reason SeekRequest
   * carries one: two presses of the same key are two requests, and a boolean cannot say so.
   *
   * It plays a recording that has not been fetched yet, which is the case that makes the shortcut
   * worth having — otherwise the reader has to find and click the button first, and once they have
   * done that they have a mouse in their hand and no use for a keyboard shortcut.
   */
  playbackRequest?: { token: number } | null;
  /**
   * WT-655 — where the playhead is, so the transcript beside this can follow it.
   *
   * FILE SECONDS, VERBATIM: whatever `video.currentTime` says, unconverted. This player has no idea
   * when the meeting began and must not acquire one — the recording and the transcript are on
   * different clocks, and the arithmetic between them belongs in the one module that owns it (see
   * recording-seek.ts). Given a raw number, the caller can be the only place the two clocks meet.
   *
   * Null means "no playhead": nothing loaded, the element replaced by a failure notice, or this
   * player gone from the page. The transcript retracts its highlight rather than leaving it on a
   * line that stopped playing.
   */
  onPlaybackSeconds?: (seconds: number | null) => void;
  /** Whether the recording is moving. The follow-along pill and the "do nothing while paused" rule
   *  both hang off this, and only the media element knows it. */
  onPlayingChange?: (playing: boolean) => void;
  /**
   * WT-655 — how long the file runs, so a moment after the recording stopped can be refused.
   *
   * FILE SECONDS, like `onPlaybackSeconds`, and for the same reason: this is `video.duration`
   * verbatim, and the caller is the only place it may meet the meeting's clock.
   *
   * WHY IT COMES FROM HERE AND NOT FROM THE DATABASE
   *   `seekTargetSeconds` has always refused a target past the end of the recording, and that
   *   branch had never executed: nothing supplied a duration, because there is no duration column
   *   to supply one from. So a moment spoken after the host stopped recording produced a valid,
   *   positive offset, the browser clamped `currentTime` to the end, and the reader was shown the
   *   final frame — indistinguishable from a seek that worked. The media element knows the number;
   *   asking it is enough for the refusal and deliberately not enough to pick between several
   *   recordings, which needs every file's length known BEFORE any of them is loaded.
   *
   * NULL MEANS NOT KNOWN, AND NOT KNOWN IS NOT A NUMBER
   *   `video.duration` is NaN until metadata arrives and `Infinity` for a stream or a container
   *   with no length in its header. Publishing either as a number would make the guard reject
   *   every moment (NaN comparisons are false, so it would in fact reject none — worse, it would
   *   look guarded) so both become null and the guard stays dormant, which is the honest state.
   */
  onDurationSeconds?: (seconds: number | null) => void;
  /**
   * Why there is no playable recording, when the CALLER knows and this player cannot.
   *
   * Only a `ready` recording is handed down as `artifact`, and that filter happens upstream from
   * the full artifact list — so a recording that exists but is still being encoded arrives here as
   * `artifact: null` and, from in here, is indistinguishable from a meeting nobody recorded. The
   * page rendered nothing at all, which is the wrong answer told confidently to the one person who
   * just left the meeting and is waiting for the video. The caller holds the list, so the caller
   * holds the answer; this is how it says it.
   *
   * `processing` mounts no <video>: there are no bytes behind it yet. `multiple` is the meeting
   * with more than one recording, where no single frame can honestly claim to be THE recording a
   * moment belongs to — the count is the caller's to phrase if it wants one, not this component's.
   *
   * Absent (or `null`) keeps the old behaviour exactly: no artifact and no reason renders nothing,
   * because a meeting that simply was not recorded should get a plain reading page — no frame, no
   * notice, nothing to dismiss.
   */
  unavailableReason?: "processing" | "multiple" | null;
  /**
   * `pip` is the rail's corner of Option C: the recording stops being a column of its own and
   * becomes a 16:9 frame the width of the rail. Below 1280px even that is too much horizontal
   * budget for a picture nobody is watching while they read, so the frame collapses to the height
   * of its own transport controls — a player bar, which is all the spec asks for in that band.
   */
  variant?: "section" | "pip";
}) {
  // The URL is stored WITH the artifact it belongs to, rather than being cleared by an effect when
  // that artifact changes. A stale link then simply stops matching and is ignored — no effect can
  // fire late and leave the previous meeting's recording playing under a new meeting's transcript.
  const [loaded, setLoaded] = useState<{ artifactId: string; url: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const sourceUrl = artifact && loaded?.artifactId === artifact.id ? loaded.url : null;
  // Paired with the url that produced it, for the same reason `loaded` is paired with its artifact:
  // a failure belongs to ONE link. A fresh link must not inherit the dead one's message, and a
  // change of artifact must not leave the previous recording's notice sitting over the new one.
  const [failure, setFailure] = useState<{
    url: string;
    kind: RecordingPlaybackFailure;
  } | null>(null);
  const playbackFailure =
    sourceUrl && failure?.url === sourceUrl ? failure.kind : null;
  /**
   * Whether the link now loaded was fetched to replace one that had just failed.
   *
   * `MEDIA_ERR_SRC_NOT_SUPPORTED` is what a browser reports both for a presigned link that has
   * aged out AND for a file it genuinely cannot decode, and `MediaError` carries no HTTP status to
   * tell them apart — so the first failure is read as the likelier of the two, an expired link.
   * That guess is only safe once. A file that fails again on a link fetched seconds ago is not
   * expiring; offering "load a new one" a second time would be a loop with no exit, and each turn
   * of it teaches the reader that the button does nothing. The reload IS the experiment, and this
   * ref carries its result.
   */
  const reloadedAfterFailureRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Held so a seek that arrives before the file is loaded is honoured once it is, rather than
  // dropped — the first click on a transcript line is exactly that case, since the player waits
  // for a press before fetching anything.
  const pendingSeekRef = useRef<SeekRequest | null>(null);
  // The last Space this player acted on. `loadRecording` is rebuilt on every render, so the effect
  // below re-runs constantly; without a record of what it has already done, an unrelated keystroke
  // three components away would pause the recording somebody had just started.
  const handledPlaybackRef = useRef<number | null>(null);

  // Not setState: this drives an external system (the media element) from React state, which is
  // what an effect is actually for.
  useEffect(() => {
    if (!seek) return;
    const video = videoRef.current;
    if (!video || !sourceUrl) {
      pendingSeekRef.current = seek;
      return;
    }
    video.currentTime = seek.seconds;
    // Play, because somebody who clicked a line wants to HEAR it. A paused seek looks like
    // nothing happened on a control they cannot see move.
    void video.play().catch(() => {
      // Autoplay refused — the frame has still moved, which is the part that matters.
    });
  }, [seek, sourceUrl]);

  /* Above the `if (!artifact)` below, and memoised, because Space now reaches it: the playback
     effect has to be able to call it, effects have to be declared before that early return, and an
     un-memoised function would rebuild the effect's dependencies on every render. */
  const loadRecording = useCallback(async () => {
    if (!artifact || isLoading) return;
    setIsLoading(true);
    try {
      if (artifact.consentRequired) {
        await translationRoomService.approveArtifactConsent(artifact.id);
      }
      const { data } = await translationRoomService.artifactDownload(artifact.id);
      // `content` is the inline path used by the text exports; a recording always arrives as a
      // link, so an absent url here means the file is gone rather than that it is empty.
      if (!data.url) {
        toast.error("This recording is no longer available.");
        return;
      }
      setLoaded({ artifactId: artifact.id, url: data.url });
      if (artifact.consentRequired) onConsentGranted?.();
    } catch (error) {
      // Withheld is a policy answer, not a failure — the same distinction the download path and
      // the Summary tab already draw.
      if (isArtifactWithheld(error)) {
        toast.info(getErrorMessage(error, ARTIFACT_WITHHELD_FALLBACK));
        return;
      }
      toast.error(getErrorMessage(error, "Could not load this recording."));
    } finally {
      setIsLoading(false);
    }
  }, [artifact, isLoading, onConsentGranted]);

  /**
   * Mint a new link for the same recording, after the last one stopped opening.
   *
   * `loaded` is dropped to null FIRST, and that is load-bearing rather than tidiness: object
   * storage can perfectly well hand back a presigned url that is character-for-character the one we
   * already hold, React would then see no change to `src`, and the element would never retry — the
   * retry button would look broken in exactly the case it exists for. Clearing unmounts the
   * <video>, so a fresh url mounts a fresh element that fetches again from scratch.
   *
   * `pendingSeekRef` is deliberately left alone. A reader who clicked a transcript line and hit a
   * dead link still wants that moment; the queued seek survives the reload and is applied by
   * onLoadedMetadata once the new element has metadata, which is the same path a first-ever load
   * takes.
   */
  const reloadRecording = useCallback(() => {
    // A reload is the experiment that settles what MediaError could not. See the ref below.
    reloadedAfterFailureRef.current = true;
    setFailure(null);
    setLoaded(null);
    void loadRecording();
  }, [loadRecording]);

  // Same shape as the seek effect above, and for the same reason: this drives a media element,
  // which is an external system, from a value React holds.
  useEffect(() => {
    if (!playbackRequest || handledPlaybackRef.current === playbackRequest.token) return;
    handledPlaybackRef.current = playbackRequest.token;

    const video = videoRef.current;
    if (!video || !sourceUrl) {
      // Nothing fetched yet. Space means "start the recording", and the first press is the press
      // that has to do the fetching — otherwise the shortcut is useless exactly when it is wanted,
      // and the reader has to go and find the button, at which point they have a mouse in hand.
      void loadRecording();
      return;
    }
    if (video.paused) {
      void video.play().catch(() => {
        // Autoplay refused — nothing to report; the controls are right there.
      });
      return;
    }
    video.pause();
  }, [playbackRequest, sourceUrl, loadRecording]);

  /**
   * WT-655 — no element, no playhead.
   *
   * The <video> is not merely hidden in the failure and not-yet-loaded states, it is unmounted, so
   * no `pause` event ever fires on the way out. Without this the transcript would keep the last
   * line it saw lit up — and, on a link that expired mid-sentence, would keep it lit up beside a
   * frame explaining that nothing can play. Folding the pip away with "Hide" unmounts this whole
   * component, which is what the cleanup is for.
   */
  const hasPlayhead = Boolean(sourceUrl) && !playbackFailure;
  useEffect(() => {
    if (hasPlayhead) return;
    onPlaybackSeconds?.(null);
    onPlayingChange?.(false);
    // The duration goes with the element. A number left standing after the <video> was replaced by
    // a failure notice would keep the caller's past-the-end guard armed with the length of a file
    // nothing can read any more — and after a reload of the SAME recording that is harmless, but
    // after the reader folds the pip away and the page later mounts a different meeting's it is a
    // refusal computed against the wrong file.
    onDurationSeconds?.(null);
  }, [hasPlayhead, onPlaybackSeconds, onPlayingChange, onDurationSeconds]);
  useEffect(
    () => () => {
      onPlaybackSeconds?.(null);
      onPlayingChange?.(false);
      onDurationSeconds?.(null);
    },
    // All three are the caller's own stable functions. An inline arrow at the call site would make
    // this cleanup run on every render of the caller and retract the highlight continuously.
    [onPlaybackSeconds, onPlayingChange, onDurationSeconds],
  );

  /**
   * WT-655 — the file's own length, on its way up to the caller.
   *
   * Read from the element rather than from an event field because there isn't one: `durationchange`
   * and `loadedmetadata` both carry the element as their target and nothing else. Both are wired to
   * this, because a duration is not a fact that arrives once — a fragmented MP4 reports `Infinity`
   * first and revises it, and an element handed a fresh presigned url for the same recording starts
   * over at NaN.
   */
  const publishDuration = useCallback(
    (video: HTMLVideoElement) => {
      const seconds = video.duration;
      // `> 0` as well as finite: a zero-length duration is the element saying it has nothing, and a
      // zero would make the guard refuse every moment in the meeting.
      onDurationSeconds?.(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    },
    [onDurationSeconds],
  );

  const isPip = variant === "pip";
  /* One element at both sizes, not two mounted in parallel: a second <video> would be a second
     fetch of a short-lived link, a second consent decision, and a playhead that jumps when the
     window crosses 1280px. The picture is removed by giving the element the height of its own
     native controls — the frame goes, the transport stays. */
  const frameClass = isPip
    ? "h-[56px] w-full bg-black xl:aspect-video xl:h-auto"
    : "aspect-video w-full bg-black";
  /* Everything that is not a playing video sits in the same box at the same size, so the frame
     never resizes the page underneath as it changes state.

     A pip carrying WORDS is allowed to be taller than the 56px bar it becomes: the consent sentence
     has to be readable BEFORE the press that records the consent, and an expired link has to be
     readable at all — clipping either to the height of a transport bar would be hiding it. */
  const noticeFrameClass = cn(
    "flex w-full flex-col items-center justify-center gap-3 bg-surface-2/40 px-6 text-center",
    isPip ? "gap-2 py-3 xl:aspect-video xl:py-0" : "aspect-video",
  );

  // Nothing to watch is not an error state, and an empty player frame promising a video that does
  // not exist is worse than no frame at all. With no artifact AND no reason from the caller, the
  // meeting simply was not recorded and this renders nothing — deliberately, so an unrecorded
  // meeting gets a plain reading page. A reason is the caller saying it knows better; see the
  // `unavailableReason` prop.
  if (!artifact) {
    if (!unavailableReason) return null;
    return (
      <RecordingFrame isPip={isPip}>
        <div className={noticeFrameClass}>
          {unavailableReason === "processing" ? (
            <>
              <SpinnerGap size={22} className="animate-spin text-ink-muted" />
              <p className="text-[13px] font-medium text-ink">
                Recording is being processed
              </p>
              <p className="text-[12px] leading-5 text-ink-muted">
                The video is still being prepared. It will appear here once it is
                ready — this page updates on its own.
              </p>
            </>
          ) : (
            <>
              <WarningCircle size={22} className="text-ink-muted" />
              <p className="text-[13px] font-medium text-ink">
                More than one recording
              </p>
              <p className="text-[12px] leading-5 text-ink-muted">
                This meeting has more than one recording, and this page cannot yet
                tell which one a given moment belongs to. Download them from the
                Artifacts tab to watch.
              </p>
            </>
          )}
        </div>
      </RecordingFrame>
    );
  }

  return (
    <RecordingFrame isPip={isPip}>
      {playbackFailure ? (
        /* The video is replaced rather than covered: the element behind a failed src is a black
           rectangle with a transport that goes nowhere, and leaving it mounted would be offering
           controls for something that cannot play. */
        <div className={noticeFrameClass}>
          {playbackFailure === "expired" ? (
            <>
              <WarningCircle size={22} className="text-ink-muted" />
              <p className="text-[13px] font-medium text-ink">
                The link to this recording has expired
              </p>
              <p className="text-[12px] leading-5 text-ink-muted">
                Links to the video last about fifteen minutes. Load a new one to
                carry on watching.
              </p>
              <button
                type="button"
                onClick={reloadRecording}
                disabled={isLoading}
                className={cn(
                  "flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-surface-1 transition-opacity hover:opacity-90 disabled:opacity-60",
                  isPip ? "px-3 py-1.5 text-[12px] xl:px-4 xl:py-2 xl:text-[13px]" : "",
                )}
              >
                {isLoading ? (
                  <SpinnerGap size={16} className="animate-spin" />
                ) : (
                  <ArrowsClockwise size={16} />
                )}
                {isLoading ? "Loading…" : "Reload recording"}
              </button>
            </>
          ) : (
            <>
              <WarningCircle size={22} className="text-ink-muted" />
              <p className="text-[13px] font-medium text-ink">
                Could not play this recording
              </p>
              <p className="text-[12px] leading-5 text-ink-muted">
                The file was reached but the browser could not play it. Downloading
                it from the Artifacts tab may still work.
              </p>
            </>
          )}
        </div>
      ) : sourceUrl ? (
        // controls, and nothing else: autoplay on a page someone opened to read a transcript is
        // a room full of unexpected sound.
        <video
          ref={videoRef}
          src={sourceUrl}
          controls
          preload="metadata"
          className={frameClass}
          onLoadedMetadata={(event) => {
            // Metadata arrived, so this link opens: whatever the previous one's failure was, it is
            // settled and spent. Without this reset the very first expiry would mark the player
            // for the rest of its life, and the NEXT genuine expiry — an hour of reading later —
            // would be reported as an unplayable file with no reload offered.
            reloadedAfterFailureRef.current = false;
            publishDuration(event.currentTarget);
            const queued = pendingSeekRef.current;
            if (!queued) return;
            pendingSeekRef.current = null;
            /**
             * WT-655 — the queued seek is the one the caller's guard could not see.
             *
             * A click that lands before the file has been fetched is held in `pendingSeekRef` and
             * applied here. At the instant it was made the page had no duration to check it
             * against — the player only fetches on demand, so nothing had loaded — which means the
             * past-the-end refusal upstream cannot have run for exactly the first click of every
             * visit. This is that refusal, made at the only moment the number exists: right now,
             * on the element.
             *
             * FILE AXIS AGAINST FILE AXIS, AND NOTHING ELSE. `queued.seconds` is already an offset
             * into this file, computed by recording-seek.ts; `duration` is this file's length. No
             * meeting clock appears in this component and none may — see the header of
             * recording-seek.ts for what a second subtraction of the two origins costs.
             *
             * Dropped rather than clamped, because the browser's own clamp is the bug: it parks the
             * playhead on the last frame, which is a still picture of the meeting ending and looks
             * exactly like a seek that worked.
             */
            const duration = event.currentTarget.duration;
            if (Number.isFinite(duration) && duration > 0 && queued.seconds > duration) {
              toast.info("This recording stopped before that moment.");
              return;
            }
            event.currentTarget.currentTime = queued.seconds;
            void event.currentTarget.play().catch(() => {});
          }}
          /* A duration is revised, not announced once: a fragmented MP4 reports `Infinity` until
             enough of it has been read to know better, and a caller that only ever heard
             `loadedmetadata` would keep an unknown length forever on exactly the containers the
             egress pipeline produces. */
          onDurationChange={(event) => publishDuration(event.currentTarget)}
          /* WT-655 — the playhead, for the transcript to follow.
             `timeupdate` fires roughly four times a second while playing, and the provider throttles
             to about that rate whatever this browser's rate turns out to be. The `paused` guard is
             the "nothing runs while paused" rule at its source: the event also fires for a SEEK made
             while paused, and honouring that would drag a reader who paused deliberately and
             scrolled away back to the playhead they had just left. */
          onTimeUpdate={(event) => {
            if (event.currentTarget.paused) return;
            onPlaybackSeconds?.(event.currentTarget.currentTime);
          }}
          onPlay={() => onPlayingChange?.(true)}
          onPause={() => onPlayingChange?.(false)}
          // Ended is not paused as far as the element's own events go, and a recording that ran to
          // the end must stop being "playing" or the follow pill would hang around over a finished
          // video offering to chase a playhead that has stopped.
          onEnded={() => onPlayingChange?.(false)}
          /* WT-655: without this the frame just went black. The surrounding code only ever
             reported a missing `url` FIELD, which says nothing about whether that url opens —
             and a fifteen-minute presigned link on a page people keep open will routinely stop
             opening. Every failure to play was therefore silent, which is why the whole seek
             feature looked broken rather than merely stale. */
          onError={(event) => {
            const classified = classifyPlaybackFailure(event.currentTarget.error);
            // Aborted playback is us, not a failure — nothing happened worth saying.
            if (!classified) return;
            // A second failure on a link fetched to replace a failed one settles it: the file is
            // the problem, not the link's age.
            const kind =
              classified === "expired" && reloadedAfterFailureRef.current ? "broken" : classified;
            setFailure({ url: sourceUrl, kind });
            // The frame says both cases, so only the genuine fault also toasts: below 1280px the
            // pip is a strip in the corner of the rail, and a broken FILE is worth knowing about
            // even if the reader never looks up at it. An expired link is ordinary and stays
            // where the reload button is.
            if (kind === "broken") toast.error("Could not play this recording.");
          }}
        />
      ) : (
        <div className={noticeFrameClass}>
          <button
            type="button"
            onClick={() => void loadRecording()}
            disabled={isLoading}
            className={cn(
              "flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-surface-1 transition-opacity hover:opacity-90 disabled:opacity-60",
              isPip ? "px-3 py-1.5 text-[12px] xl:px-4 xl:py-2 xl:text-[13px]" : "",
            )}
          >
            {isLoading ? (
              <SpinnerGap size={16} className="animate-spin" />
            ) : (
              <Play size={16} weight="fill" />
            )}
            {isLoading ? "Loading…" : "Play recording"}
          </button>
          {artifact.consentRequired && (
            // Said before the click, not after: the first press records a consent decision, and
            // a control that does that silently is the one thing this must not be.
            <p className="text-[12px] text-ink-muted">
              Playing this recording records your consent, the same as downloading it.
            </p>
          )}
        </div>
      )}
    </RecordingFrame>
  );
}

/**
 * The box the recording lives in, whatever is inside it.
 *
 * Shared so the player, the expired-link notice and the not-yet-playable notices cannot drift
 * apart: they are the same frame in different states, and a reader watching one become another
 * should see the contents change, not the page reflow around a different-shaped box.
 */
function RecordingFrame({
  isPip,
  children,
}: {
  isPip: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={isPip ? undefined : "mb-5"} aria-label="Meeting recording">
      <div
        className={cn(
          "overflow-hidden border border-border bg-black",
          isPip ? "rounded-[8px]" : "rounded-[10px]",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * True for a while after a meeting ends.
 *
 * The summary is generated asynchronously, so the gap between "ended" and "summary exists" is
 * normal rather than a failure — during that window the panel says it is being generated
 * instead of claiming there is none.
 */
export function useRecentlyEnded(
  endedAt: string | null | undefined,
  windowMs = 10 * 60 * 1000,
): boolean {
  const [observedNow, setObservedNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setObservedNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (!endedAt) return false;
  const ended = new Date(endedAt).getTime();
  if (Number.isNaN(ended)) return false;
  return observedNow - ended < windowMs;
}

/**
 * "The transcript changed after this was written."
 *
 * Not an error state and not styled as one: the summary is not broken, it is simply describing
 * text that has since been corrected. It offers the one action that resolves it and otherwise
 * stays out of the way — the reader may well decide a typo fix does not warrant regenerating.
 */
function SummaryStalenessNotice({
  onRegenerate,
  busy,
}: {
  onRegenerate: () => void;
  busy: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border bg-surface-2 px-3 py-2">
      <WarningCircle size={14} className="shrink-0 text-ink-muted" />
      <p className="min-w-0 flex-1 text-[12px] text-ink-muted">
        The transcript was corrected after this summary was written — what is below may no
        longer match it.
      </p>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={busy}
        className="shrink-0 rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-ink disabled:opacity-60"
      >
        {busy ? "Regenerating…" : "Regenerate summary"}
      </button>
    </div>
  );
}

export function SummaryPanel({
  room,
  busyArtifactId,
  onDownload,
  onJumpToMoment,
  onRewrite,
  segments,
  hasTranscript,
}: {
  room: EndedRoomHistoryItem;
  busyArtifactId: string | null;
  onDownload: (artifact: RoomHistoryArtifact) => void;
  /** Open the transcript at the moment a summary item cites. Omit to render items as
   *  plain text — which is also what happens for a summary written before citations. */
  onJumpToMoment?: (atMs: number) => void;
  /** Ask for the summary to be rewritten in another shape. Omit to hide the picker. */
  onRewrite?: (templateKey: string) => Promise<void>;
  /** The transcript's segments, when the surrounding page has them. Supplied only so the panel
   *  can tell the reader their summary is behind a correction — see SummaryStalenessNotice. */
  segments?: readonly StalenessSegment[] | null;
  /**
   * Whether the meeting captured any transcript at all, once the page knows.
   *
   * Omitted (or `undefined`) means "not loaded yet", and nothing is concluded from it — an
   * un-fetched transcript must never be read as a meeting nobody spoke in.
   */
  hasTranscript?: boolean;
}) {
  const artifact = room.artifacts.find(
    (item) => item.type === "summary_export",
  );
  const summary = room.summary;
  const ready = artifact?.status === "ready";
  const busy = busyArtifactId === artifact?.id;
  const hasStructuredContent = Boolean(
    summary &&
      !summary.insufficientData &&
      (summary.summary || summary.decisions.length || summary.actionItems.length),
  );
  const recentlyEnded = useRecentlyEnded(room.endedAt);

  // WT-369 — resolveSummaryState was written, documented and unit-tested for exactly this, and
  // then never called from anywhere. Its own doc comment describes the line it was meant to
  // replace — `isGenerating = !artifact && recentlyEnded` — which was still sitting right here.
  //
  // The two are not equivalent. That flag only knows "no artifact yet", so an artifact that
  // exists but is still `processing` fell straight through to "This meeting ended without a
  // summary artifact" — printed directly above its own Download button — and a summary that
  // landed after the wall-clock timer expired got the same false sentence. State belongs to the
  // artifact, not to a clock.
  const summaryState = resolveSummaryState({
    artifactStatus: artifact?.status,
    hasStructuredContent,
    insufficientData: summary?.insufficientData,
    recentlyEnded,
    hasTranscript,
  });
  const isGenerating = summaryState === "generating";

  // "Not shared with you" is not "does not exist". The ROW existing is the fact this panel could
  // not see: room artifacts default to HOST_ONLY and the history projection omits `content` for
  // anyone the access policy refuses, while still listing the artifact. See
  // lib/meeting/summary-absence.ts.
  const summaryAbsence = describeSummaryAbsence({
    isGenerating,
    summaryState,
    hasSummaryArtifact: Boolean(artifact),
    hasParsedSummary: Boolean(summary),
    insufficientData: summary?.insufficientData,
    hasTranscript,
  });

  const currentTemplate = summary?.templateKey ?? DEFAULT_SUMMARY_TEMPLATE;
  // Derived, never stored. See summary-staleness.ts for why a flag would end up lying.
  const stale = isSummaryStale(segments, artifact);
  const [requestedTemplate, setRequestedTemplate] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const isRewriting = requestedTemplate !== null && requestedTemplate !== currentTemplate;

  useEffect(() => {
    // A rewrite that never lands must not leave the picker spinning forever — the summary
    // arrives on the artifact asynchronously, and "still waiting" and "never coming" look
    // identical without a deadline.
    if (!isRewriting) return;
    const timer = window.setTimeout(() => {
      setRequestedTemplate(null);
      toast.error("The rewritten summary has not arrived. Try again.");
    }, 90_000);
    return () => window.clearTimeout(timer);
  }, [isRewriting]);

  async function copyAsText() {
    if (!summary) return;
    const lines = [
      `${room.title} — AI meeting summary`,
      "",
      "Overview",
      summary.summary || "(no overview)",
      "",
      "Decisions",
      ...(summary.decisions.length
        ? summary.decisions.map((decision) => `- ${decision}`)
        : ["(none recorded)"]),
      "",
      "Action items",
      ...(summary.actionItems.length
        ? summary.actionItems.map(
            (action) =>
              `- [ ] ${action.owner ? `${action.owner}: ` : ""}${action.task}`,
          )
        : ["(none recorded)"]),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Summary copied to clipboard.");
    } catch {
      toast.error("Could not copy the summary.");
    }
  }

  return (
    <div className="flex min-h-[320px] flex-col border border-border bg-canvas">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="text-[10px] font-medium text-ink-subtle">
          SUMMARY OUTPUT
        </span>
        <span className="flex items-center gap-3">
          {onRewrite ? (
            <select
              value={isRewriting ? (requestedTemplate as string) : currentTemplate}
              disabled={isRewriting}
              onChange={async (event) => {
                const templateKey = event.target.value;
                if (templateKey === currentTemplate) return;
                setRequestedTemplate(templateKey);
                try {
                  await onRewrite(templateKey);
                } catch {
                  setRequestedTemplate(null);
                }
              }}
              aria-label="Summary shape"
              title="Rewrite this summary in a different shape"
              className="h-6 rounded border border-border bg-surface-1 px-1 text-[10px] text-ink disabled:opacity-60"
            >
              {SUMMARY_TEMPLATES.map((template) => (
                <option key={template.key} value={template.key} title={template.description}>
                  {template.label}
                </option>
              ))}
            </select>
          ) : null}
          {isRewriting ? (
            <span className="flex items-center gap-1 text-[10px] text-ink-subtle">
              <SpinnerGap size={12} className="animate-spin" /> Rewriting…
            </span>
          ) : null}
          <span className="text-[10px] text-ink-subtle">
            {artifact?.format || "No file"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!hasStructuredContent}
            onClick={copyAsText}
            className="h-6 rounded px-2 text-[10px] shadow-none"
          >
            <Copy size={12} /> Copy
          </Button>
        </span>
      </div>

      {hasStructuredContent && summary ? (
        <div className="flex-1 space-y-6 p-6">
          {/* Above the content, because it is a caveat ON the content. Only shown where the
              caller supplied segments — the ended page reads the transcript as exported text and
              has no corrections to compare against. Reuses onRewrite with the CURRENT template:
              regenerating is the same operation as reshaping, aimed at the same shape. */}
          {stale && onRewrite ? (
            <SummaryStalenessNotice
              busy={regenerating}
              onRegenerate={async () => {
                setRegenerating(true);
                try {
                  await onRewrite(currentTemplate);
                } finally {
                  // Cleared when the REQUEST is accepted, not when the summary lands — that
                  // arrives asynchronously on the artifact. The notice removes itself once the
                  // rewritten summary's updatedAt passes the correction, so a button that stayed
                  // busy until then would be claiming to know something it cannot see.
                  setRegenerating(false);
                }
              }}
            />
          ) : null}
          <section>
            <h3 className="text-[11px] font-semibold uppercase text-ink-subtle">
              Overview
            </h3>
            <p className="mt-2 text-[12px] leading-6 text-ink">
              {summary.summary}
            </p>
          </section>

          {/* Sections come from the template the assistant used, so a standup shows
              blockers and an interview shows concerns, rather than every meeting being
              forced into decisions-and-action-items. */}
          {(summary.sections ?? []).map((section) => (
            <section key={section.key}>
              <h3 className="text-[11px] font-semibold uppercase text-ink-subtle">
                {section.title}
              </h3>
              <ul className="mt-2 space-y-2">
                {section.items.map((item, index) => (
                  <li
                    key={`${section.key}-${index}`}
                    className="flex items-start gap-2 text-[12px] leading-5 text-ink"
                  >
                    <CheckSquare
                      size={14}
                      className="mt-0.5 shrink-0 text-ink-subtle"
                    />
                    <span className="min-w-0">
                      {item.owner ? (
                        <span className="font-medium">{item.owner}: </span>
                      ) : null}
                      {item.text}
                      {/* The evidence. A claim the assistant could not anchor to a moment
                          has no button here, which is itself the signal worth seeing. */}
                      {item.atMs !== null && onJumpToMoment ? (
                        <button
                          type="button"
                          onClick={() => onJumpToMoment(item.atMs as number)}
                          title="Jump to this moment in the transcript"
                          className="ml-1.5 inline-flex shrink-0 items-center rounded border border-border px-1 py-px align-baseline font-mono text-[10px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          {formatCitationTime(item.atMs)}
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {/* The hardcoded Decisions and Action items blocks are gone: both eras of
              summary now arrive as `sections`, so rendering them again here printed every
              decision twice. */}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div className="max-w-[360px]">
            {isGenerating ? (
              <SpinnerGap
                size={28}
                className="mx-auto animate-spin text-ink-muted"
              />
            ) : (
              <ChatCircleText size={28} className="mx-auto text-ink-muted" />
            )}
            {/* "Not shared with you" is not "does not exist".
                A meeting listed `summary export · Ready` under Artifacts while this panel said the
                meeting ended without one. The summary existed; room artifacts default to HOST_ONLY
                and the history projection omits `content` for anyone the access policy refuses,
                while still listing the row. This panel saw a body-less artifact and reported the
                meeting as having produced none — sending the reader after a broken generator
                instead of the host. See lib/meeting/summary-absence.ts. */}
            <h3 className="mt-4 text-[15px] font-semibold">
              {isGenerating
                ? "Generating summary…"
                : summaryAbsence === "withheld"
                  ? "Summary not shared with you"
                  : summaryAbsence === "no-transcript"
                    ? "Nothing was said to summarise"
                    : "No summary output"}
            </h3>
            <p className="mt-2 text-[11px] leading-5 text-ink-muted">
              {summaryAbsenceMessage(summaryAbsence)}
            </p>
          </div>
        </div>
      )}

      {/* WT-369: offered only when there is a summary to download.
          The artifact ROW existing is not the same as the summary existing — the finalizer
          writes a SUMMARY_EXPORT row even when the AI worker produced nothing, marked
          insufficientData. So "No summary output" was rendered with a live "Download summary
          file" button under it, and pressing it fetched a JSON blob whose only content was a
          sentence saying there was no summary. */}
      {artifact && summaryState === "ready" ? (
        <div className="border-t border-border p-4">
          <Button
            size="sm"
            variant={ready ? "default" : "outline"}
            disabled={!ready || busy}
            onClick={() => onDownload(artifact)}
            className="h-8 rounded-md text-[11px] shadow-none"
          >
            {busy ? (
              <SpinnerGap size={14} className="animate-spin" />
            ) : (
              <DownloadSimple size={14} />
            )}{" "}
            Download summary file
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ArtifactsPanel({
  artifacts,
  busyArtifactId,
  onDownload,
}: {
  artifacts: RoomHistoryArtifact[];
  busyArtifactId: string | null;
  onDownload: (artifact: RoomHistoryArtifact) => void;
}) {
  if (!artifacts.length) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center border border-border bg-canvas p-8 text-center">
        <Archive size={28} className="text-ink-muted" />
        <h3 className="mt-4 text-[15px] font-semibold">No retained artifacts</h3>
        <p className="mt-2 max-w-[360px] text-[11px] leading-5 text-ink-muted">
          Nothing has been generated or retained for this meeting yet.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[320px] border border-border bg-canvas">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="text-[10px] font-medium text-ink-subtle">
          RETAINED ARTIFACTS
        </span>
        <span className="text-[10px] text-ink-subtle">{artifacts.length}</span>
      </div>
      <div className="divide-y divide-border">
        {artifacts.map((artifact) => (
          <button
            key={artifact.id}
            type="button"
            disabled={busyArtifactId === artifact.id}
            onClick={() => onDownload(artifact)}
            className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/55 disabled:opacity-50"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface-1">
              <ArtifactIcon artifact={artifact} />
            </span>
            <span className="min-w-0 flex-1">
              {/* "Transcript", not "transcript export (TXT)". The server's title is generated
                  from the type and repeats on the second line what the first line already
                  said — and it is lowercase, because it is derived from an enum name. */}
              <span className="block truncate text-[12px] font-medium text-ink">
                {artifactLabel(artifact.type)}
              </span>
              <span className="mt-0.5 block text-[10px] text-ink-subtle">
                {artifactDownloadFormat(artifact)} · {artifactStatusLabel(artifact)}
              </span>
            </span>
            {busyArtifactId === artifact.id ? (
              <SpinnerGap size={14} className="animate-spin text-ink-muted" />
            ) : (
              <DownloadSimple
                size={14}
                className="text-ink-subtle transition-colors group-hover:text-ink"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ArtifactIcon({ artifact }: { artifact: RoomHistoryArtifact }) {
  if (artifact.status === "processing")
    return <SpinnerGap size={14} className="animate-spin text-ink-muted" />;
  if (["failed", "missing", "expired"].includes(artifact.status))
    return <WarningCircle size={14} className="text-ink-muted" />;
  return <CheckCircle size={14} className="text-primary" />;
}
