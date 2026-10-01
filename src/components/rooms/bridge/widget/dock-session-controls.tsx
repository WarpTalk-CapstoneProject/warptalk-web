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
 *   Nothing here holds "is translation running" or "is the transcript paused" in local state. The
 *   context answers both: from the main window's relay snapshot when it sends them (WT-901 —
 *   instant), else from queries (the sessions list, the pause windows) that every REST mutation
 *   below refetches — see `settle` — so the button flips when the meeting says so, not when this
 *   window guesses.
 *
 * TWO ROUTES FOR STOP AND PAUSE, ONE FOR START (WT-901)
 *   - Stop and Pause/Resume go to the main window as relay intents whenever it is running this
 *     room and its snapshot carries the matching field (canRelayStopTranslation /
 *     canRelayTranscriptPause). Its own handlers then run — the native host check, request and
 *     toasts — and the button waits for the snapshot to flip (use-relayed-switch.ts). Without such
 *     a main window they fall back to the REST mutations below, as before; those are why this file
 *     still holds useStopTranslation and useSetTranscriptPaused (check-bridge-overlay-contract.mjs).
 *   - Start always goes through startBridgeTranslation, relay or not: it is what asks the main
 *     window to carry the room in the first place, so it has to work with no main window answering.
 *
 * ERRORS ARE THE SERVER'S WORDS
 *   `getErrorMessage`, as the native controls do (WT-699): a Start refused because the workspace is
 *   out of credits must say so, not "Request failed with status code 403".
 *
 * THERE IS NO END HERE (PO, 2026-10-01)
 *   The popup does not end a bridge meeting; it ends when the Google Meet conference does. Only
 *   translation controls live in this dock.
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
import { getErrorMessage } from "@/lib/api/errors";
import { getErrorStatus } from "@/lib/api/retry-policy";
import { activateBridgeRoom } from "@/lib/desktop/bridge";
import { startBridgeTranslation } from "@/lib/meeting/bridge-overlay-start";
import { canRelayStopTranslation, canRelayTranscriptPause } from "@/lib/meeting/bridge-widget-relay";

import { DockIconButton } from "./dock-icon-button";
import { useRelayedSwitch } from "./use-relayed-switch";
import { useBridgeWidget } from "./widget-context";

const STOPPED_TOAST = "Translation stopped. The transcript keeps running.";
/** The main window refused, or never answered, and said why only where the user cannot see it. */
const NO_ANSWER_DESCRIPTION = "Check the WarpTalk window for details, then try again.";

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
  const { room, translationStarted, translationStatus, translationMirrored, relay } =
    useBridgeWidget();
  const queryClient = useQueryClient();
  const relayed = useRelayedSwitch(translationStarted, {
    onConfirmed: (started) => {
      if (!started) toast.success(STOPPED_TOAST);
    },
    onTimeout: (started) => {
      // A Start that REST already accepted needs no word here; the mirror is only slow.
      if (!started) toast.error("Could not stop translation.", { description: NO_ANSWER_DESCRIPTION });
    },
  });
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
    working
    || relayed.waiting
    || startRoom.isPending
    || resumeRoom.isPending
    || stopTranslation.isPending;

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
      // The main window's own Stop, when one is running this room: see the header.
      if (canRelayStopTranslation(relay.view) && relay.stopTranslation()) {
        relayed.expect(false);
        setWorking(false);
        return;
      }
      // Same mutation and the same two toasts as bridge-overlay-controls.tsx's Stop.
      try {
        await stopTranslation.mutateAsync(room.id);
        await settle(room.id);
        toast.success(STOPPED_TOAST);
      } catch (error) {
        toast.error(getErrorMessage(error, "Failed to stop translation."));
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
      // The mirror can trail the REST answer by a snapshot; hold the spinner until it agrees, so
      // the button does not flash back to Start.
      if (translationMirrored) relayed.expect(true);
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
      // WT-699: the backend's sentence (out of credits, invoice overdue…), never the status line.
      toast.error(getErrorMessage(error, "Failed to start translation."));
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
  const { roomId, transcriptPaused, transcriptPauseKnown, relay } = useBridgeWidget();
  const queryClient = useQueryClient();
  const setTranscriptPaused = useSetTranscriptPaused(roomId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** As `working` above: held until the pause windows have been re-read. */
  const [working, setWorking] = useState(false);
  const relayed = useRelayedSwitch(transcriptPaused, {
    onTimeout: (paused) => {
      toast.error(paused ? "Could not pause the transcript." : "Could not resume the transcript.", {
        description: NO_ANSWER_DESCRIPTION,
      });
      void queryClient.refetchQueries({ queryKey: transcriptPauseWindowsKey(roomId) });
    },
  });
  const busy = working || relayed.waiting || setTranscriptPaused.isPending;

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
    // The main window's own commit, when one is running this room. The question was already asked
    // here, so it commits directly — it does not ask a second time in a window behind Meet.
    if (canRelayTranscriptPause(relay.view) && relay.setTranscriptPaused(nextPaused)) {
      relayed.expect(nextPaused);
      return;
    }
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
          getErrorMessage(
            error,
            nextPaused ? "Could not pause the transcript." : "Could not resume the transcript.",
          ),
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
