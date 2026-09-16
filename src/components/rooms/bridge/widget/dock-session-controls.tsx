"use client";

/**
 * SLOT: the left end of the widget dock. Owner: WT-525 t3.
 *
 * CONTRACT
 *   `export function DockSessionControls()` — no props; read from `useBridgeWidget()`.
 *   Renders Start/Stop translation and Pause/Resume transcript as `DockIconButton`s
 *   (dock-icon-button.tsx), left-aligned tooltips. Nothing else: Meet owns mic, camera and
 *   leaving, and the dock must not look like Meet's call bar.
 *
 * WHY BOTH ARE HOST-ONLY, AND WHY A NON-HOST SEES NOTHING
 *   `/resume`, `/stop-translation` and the transcript pause endpoints all gate on the host on the
 *   server. A button offered to anybody else is a 403 and a toast over someone's live call. A
 *   bridge room has two seats and the host is the person at this machine, so this is nearly always
 *   moot — but "nearly" is why it is checked. Nothing rather than a disabled button: a control
 *   that exists and refuses reads as broken.
 *
 * WHERE THE STATE COMES FROM
 *   Nothing here holds "is translation running" or "is the transcript paused" in local state. Both
 *   are server facts the context derives from queries (the sessions list, the pause windows), and
 *   every mutation below ends by refetching the query it changed — see `settle` — so the button
 *   flips when the server says so, not when this window guesses. This window never receives the
 *   room's broadcasts (use-bridge-widget-state.ts explains why it must not join the group), so the
 *   refetch is the only way it learns the answer at all.
 */

import { useState } from "react";
import { Pause, Play, SpinnerGap, Stop } from "@phosphor-icons/react/dist/ssr";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { TranscriptPauseConfirmDialog } from "@/components/rooms/live/transcript-pause-confirm-dialog";
import { transcriptPauseWindowsKey, useSetTranscriptPaused } from "@/hooks/use-transcripts";
import {
  sessionsKey,
  useResumeTranslationRoom,
  useStartTranslationRoom,
  useStopTranslation,
} from "@/hooks/use-translationRooms";
import { getErrorStatus } from "@/lib/api/retry-policy";
import { activateBridgeRoom } from "@/lib/desktop/bridge";
import { startBridgeTranslation } from "@/lib/meeting/bridge-overlay-start";

import { DockIconButton } from "./dock-icon-button";
import { useBridgeWidget } from "./widget-context";

/** meeting-control-bar.tsx's size, which dock-icon-button.tsx's header names for every icon. */
const ICON_SIZE = 17;

const spinner = <SpinnerGap size={ICON_SIZE} className="animate-spin" aria-hidden="true" />;

export function DockSessionControls() {
  const { isHost } = useBridgeWidget();
  // False while the room is loading too, so the two buttons appear together once the room has
  // answered rather than a Start that a moment later turns out to belong to somebody else.
  if (!isHost) return null;

  return (
    <>
      <TranslationToggle />
      <TranscriptPauseToggle />
    </>
  );
}

// ── Start / Stop translation ─────────────────────────────────────────────────

function TranslationToggle() {
  const { room, translationStarted, translationStatus } = useBridgeWidget();
  const queryClient = useQueryClient();
  const startRoom = useStartTranslationRoom();
  const resumeRoom = useResumeTranslationRoom();
  const stopTranslation = useStopTranslation();

  /**
   * The whole sequence, not just its mutations — the same reason as `starting` in
   * bridge-overlay-controls.tsx, plus one of our own:
   *   - activation is awaited before either REST call is pending, and a second press in that gap
   *     would ask the main window twice and open the room twice;
   *   - the mutations settle before the sessions list has been re-read, and in that gap
   *     `translationStarted` still holds the old answer, so the button would flash back to what it
   *     was before flipping. Held until `settle` has the new list.
   */
  const [working, setWorking] = useState(false);
  const busy =
    working || startRoom.isPending || resumeRoom.isPending || stopTranslation.isPending;

  /** "Unknown" until the sessions list first answers: Start before that may be a lie. */
  const known = room !== undefined && translationStatus !== "unknown";

  /**
   * Re-read the sessions list the context's `translationStarted` comes from. The hooks already
   * invalidate it on success; this waits for the answer, so the spinner covers the whole flip.
   * `refetchQueries` does not throw, so a failed read leaves the 5s poll to catch up.
   */
  async function settle(roomId: string) {
    await queryClient.refetchQueries({ queryKey: sessionsKey(roomId) });
  }

  async function toggleTranslation() {
    if (!room || busy) return;
    setWorking(true);

    if (translationStarted) {
      // Same mutation and the same two toasts as bridge-overlay-controls.tsx's Stop.
      try {
        await stopTranslation.mutateAsync(room.id);
        await settle(room.id);
        toast.success("Translation stopped. The transcript keeps running.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to stop translation.");
      } finally {
        setWorking(false);
      }
      return;
    }

    try {
      // Activate, then open the ROOM if nobody has, then /resume. The order is the point, and it
      // lives in startBridgeTranslation so its unit test can hold it: a session opened before the
      // main window is asked to carry the room is a room marked translating that no LiveKit
      // connection, dub or bridge leg is feeding. check-bridge-overlay-contract.mjs fails the
      // build if this file ever calls /resume outside that sequence.
      const { activated } = await startBridgeTranslation(room, {
        activate: activateBridgeRoom,
        openRoom: (id) => startRoom.mutateAsync(id),
        startTranslation: (id) => resumeRoom.mutateAsync(id),
      });
      await settle(room.id);
      if (activated) {
        toast.success("Translation started.");
      } else {
        // Word for word what bridge-overlay-controls.tsx says (#490). Without the main window this
        // is the old bug — a session marked running that nothing is feeding — and the one thing
        // the user can do about it is open the meeting there themselves.
        toast.warning("Translation started, but WarpTalk could not open this meeting.", {
          description: "Open it in the WarpTalk window so your voice and the dub are carried.",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start translation.");
    } finally {
      setWorking(false);
    }
  }

  if (translationStarted) {
    return (
      <DockIconButton
        label="Stop translation"
        // `danger` colours the icon only — see dock-icon-button.tsx on why nothing in this dock
        // may be a filled red button sitting above Meet's red hang-up.
        tone="danger"
        icon={busy ? spinner : <Stop size={ICON_SIZE} weight="fill" aria-hidden="true" />}
        onClick={() => void toggleTranslation()}
        disabled={busy}
      />
    );
  }

  return (
    <DockIconButton
      label="Start translation"
      tone="accent"
      icon={busy ? spinner : <Play size={ICON_SIZE} weight="fill" aria-hidden="true" />}
      onClick={() => void toggleTranslation()}
      // Disabled, not hidden, while the sessions list has not answered: the slot keeps its place
      // in the dock, so the language pill beside it does not jump when the answer lands.
      disabled={busy || !known}
    />
  );
}

// ── Pause / Resume transcript (WT-605) ───────────────────────────────────────

/**
 * Pausing stops the WRITTEN RECORD only. Translation, dubbing and subtitles keep running, so
 * nothing on this control may read as pausing the meeting or the translation — the confirmation
 * dialog below carries the sentence that says both halves, and it is reused rather than copied so
 * the wording the product owner settled on (2026-09-10) exists once.
 */
function TranscriptPauseToggle() {
  const { roomId, transcriptPaused, transcriptPauseKnown } = useBridgeWidget();
  const queryClient = useQueryClient();
  const setTranscriptPaused = useSetTranscriptPaused(roomId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** As `working` above: held until the pause windows have been re-read. */
  const [working, setWorking] = useState(false);
  const busy = working || setTranscriptPaused.isPending;

  /**
   * PAUSING ASKS FIRST, RESUMING DOES NOT — persistent-meeting-session's
   * handleToggleTranscriptPause, for the same reason: pausing gives up speech that is being said
   * right now and cannot be got back, resuming only starts writing again. A prompt on both sides
   * is a prompt people learn to dismiss without reading.
   */
  function toggle() {
    if (busy) return;
    if (!transcriptPaused) {
      setConfirmOpen(true);
      return;
    }
    void commit(false);
  }

  /**
   * The payload and the toasts are persistent-meeting-session's commitTranscriptPause. No
   * optimistic flip: the state is read back from the pause windows, which the hook invalidates on
   * settle — and in this window that read is the only answer, because the TranscriptPaused /
   * TranscriptResumed broadcasts never reach it.
   */
  async function commit(nextPaused: boolean) {
    setWorking(true);
    try {
      await setTranscriptPaused.mutateAsync(nextPaused);
    } catch (error) {
      // 409 INVALID_STATE is not a failure of ours — somebody else moved the switch first, and
      // the refetch below corrects the button.
      if (getErrorStatus(error) === 409) {
        toast.info(
          nextPaused ? "The transcript was already paused." : "The transcript was already running.",
        );
      } else {
        toast.error(
          nextPaused ? "Could not pause the transcript." : "Could not resume the transcript.",
        );
      }
    } finally {
      await queryClient.refetchQueries({ queryKey: transcriptPauseWindowsKey(roomId) });
      setWorking(false);
    }
  }

  // "Not told yet" is not "running" (widget-context.tsx). Until the pause windows answer — which
  // also covers a room whose transcript has not started, where the read 404s until it does — the
  // button keeps its place but offers nothing it cannot yet vouch for.
  const label = !transcriptPauseKnown
    ? "Pause transcript: not available yet"
    : transcriptPaused
      ? "Resume transcript"
      : "Pause transcript";

  return (
    <>
      <DockIconButton
        label={label}
        tone={transcriptPaused ? "warning" : "default"}
        pressed={transcriptPauseKnown ? transcriptPaused : undefined}
        icon={
          busy ? (
            spinner
          ) : transcriptPaused ? (
            <Play size={ICON_SIZE} weight="fill" aria-hidden="true" />
          ) : (
            <Pause size={ICON_SIZE} weight="fill" aria-hidden="true" />
          )
        }
        onClick={toggle}
        disabled={busy || !transcriptPauseKnown}
      />

      <TranscriptPauseConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={busy}
        onConfirm={() => {
          setConfirmOpen(false);
          void commit(true);
        }}
      />
    </>
  );
}
