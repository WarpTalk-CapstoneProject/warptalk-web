"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  CheckCircle,
  DownloadSimple,
  Play,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/api/errors";
import {
  ARTIFACT_WITHHELD_FALLBACK,
  isArtifactWithheld,
} from "@/lib/meeting/artifact-denial";
import { openArtifactDownload } from "@/lib/ui/download-artifact";
import {
  artifactDownloadFormat,
  artifactLabel,
  artifactStatusLabel,
  canDownloadArtifact,
} from "@/lib/meeting/meeting-artifacts";
import { translationRoomService } from "@/services/translation-room.service";
import type { RoomHistoryArtifact } from "@/types/roomHistory";

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

export function MeetingRecordingPlayer({
  artifact,
  onConsentGranted,
  seek,
  playbackRequest,
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

  // Nothing to watch is not an error state, and an empty player frame promising a video that does
  // not exist is worse than no frame at all. The meeting simply was not recorded.
  if (!artifact) return null;

  const isPip = variant === "pip";
  /* One element at both sizes, not two mounted in parallel: a second <video> would be a second
     fetch of a short-lived link, a second consent decision, and a playhead that jumps when the
     window crosses 1280px. The picture is removed by giving the element the height of its own
     native controls — the frame goes, the transport stays. */
  const frameClass = isPip
    ? "h-[56px] w-full bg-black xl:aspect-video xl:h-auto"
    : "aspect-video w-full bg-black";

  return (
    <section className={isPip ? undefined : "mb-5"} aria-label="Meeting recording">
      <div
        className={cn(
          "overflow-hidden border border-border bg-black",
          isPip ? "rounded-[8px]" : "rounded-[10px]",
        )}
      >
        {sourceUrl ? (
          // controls, and nothing else: autoplay on a page someone opened to read a transcript is
          // a room full of unexpected sound.
          <video
            ref={videoRef}
            src={sourceUrl}
            controls
            preload="metadata"
            className={frameClass}
            onLoadedMetadata={(event) => {
              const queued = pendingSeekRef.current;
              if (!queued) return;
              pendingSeekRef.current = null;
              event.currentTarget.currentTime = queued.seconds;
              void event.currentTarget.play().catch(() => {});
            }}
          />
        ) : (
          <div
            className={cn(
              "flex w-full flex-col items-center justify-center gap-3 bg-surface-2/40",
              // The UNLOADED pip is allowed to be taller than the bar it will become: the
              // consent sentence below has to be readable BEFORE the press that records the
              // consent, and clipping it to 56px would be hiding it.
              isPip ? "gap-2 py-3 xl:aspect-video xl:py-0" : "aspect-video",
            )}
          >
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
              <p className="px-6 text-center text-[12px] text-ink-muted">
                Playing this recording records your consent, the same as downloading it.
              </p>
            )}
          </div>
        )}
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
export function SummaryStalenessNotice({
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

/**
 * The AI summary is NOT here any more. It is in the reading rail — see
 * `meeting-reading-rail.tsx`.
 *
 * `SummaryPanel` rendered the whole summary as a full-width tab of its own, beside a rail that
 * rendered a filtered version of the same summary next to the transcript. Two components, one
 * summary, and the reader bounced between them: the tab could not show the transcript a claim
 * cited, and the rail could not show the overview, the shape picker or the download. The rail
 * won because it is the one that can sit beside the transcript, which is what makes a citation
 * checkable at all.
 */

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
