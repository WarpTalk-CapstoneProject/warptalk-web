"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useUserSettings } from "@/hooks/use-user-settings";
import { useWorkspaceSettings } from "@/hooks/use-workspace";
import { getErrorMessage } from "@/lib/api/errors";
import { isDesktopApp, readVirtualAudioStatus } from "@/lib/desktop/bridge";
import { claimAudioModeFor } from "@/lib/meeting/bridge-audio-mode";
import { claimKeyAfterTrigger, planBridgeClaim } from "@/lib/meeting/bridge-auto-room";
import type { BridgeTriggerState } from "@/lib/meeting/bridge-trigger";
import { translationRoomService } from "@/services/translation-room.service";
import { useActiveMeetingStore } from "@/stores/active-meeting-store";
import { useBridgeAudioModeStore } from "@/stores/bridge-audio-mode-store";
import { useBridgeCapturerStore } from "@/stores/bridge-capturer-store";

/**
 * The impure half of bridge-auto-room.ts: when the desktop sees a Google Meet call, CLAIM it
 * (W4b part 1) and hand the room to this window's meeting session.
 *
 * THE CLAIM, NOT A CREATE
 *   `POST /translation-rooms/bridge/claim` finds this call's room in the workspace or creates it,
 *   seats this user, and says whether this desktop CAPTURES the far side or is a MEMBER. The role
 *   goes to useBridgeCapturerStore, where the meeting session's lease hook reads it (heartbeat,
 *   which legs to open). The room the claim returns is the one carried — whoever made it.
 *
 * Handing it over is all that is needed to reach the transcript popup: the meeting session opens
 * the popup for any bridge room it carries (persistent-meeting-session.tsx), and the popup is where
 * the language is picked and translation is started.
 *
 * ONE ATTEMPT PER CALL
 *   The trigger stays in `offer` for as long as Meet is on screen and the room list has not caught
 *   up, which is several renders. `handled` keys on the Meet code, so a call gets one claim — and a
 *   refusal is shown once, not every three seconds. A different call is a new attempt, and so is
 *   the same call once a room has taken the trigger and let it go again - see claimKeyAfterTrigger.
 *
 * WHERE A FAILURE IS SHOWN
 *   The user is looking at Google Meet, not at this window, so a toast alone would go unseen. A
 *   system notification is raised as well; Electron shows it natively without asking.
 */
export function useBridgeAutoRoom({
  triggerState,
  meetCode,
  workspaceId,
}: {
  triggerState: BridgeTriggerState;
  meetCode?: string | null;
  workspaceId: string | null;
}) {
  const queryClient = useQueryClient();
  const openMeeting = useActiveMeetingStore((state) => state.openMeeting);
  const setCapturerEntry = useBridgeCapturerStore((state) => state.setEntry);
  const setAudioMode = useBridgeAudioModeStore((state) => state.setMode);
  const { data: workspaceSettings, isSuccess: workspaceSettingsLoaded } = useWorkspaceSettings(
    workspaceId ?? "",
  );
  const { data: userSettings, isFetched: userSettingsFetched } = useUserSettings();
  const handled = useRef<string | null>(null);

  // Before the claim effect, so a return to `offer` in the same commit sees the reset. Without it
  // the key lived forever: re-opening a Meet link whose room had ended answered `offer` and claimed
  // nothing (prod, 2026-10-03).
  useEffect(() => {
    handled.current = claimKeyAfterTrigger(handled.current, triggerState);
  }, [triggerState]);

  const desktop = isDesktopApp();
  // Waiting on the language inputs, not guessing without them: a room created before the
  // workspace's language list arrives is the 403 this flow exists to avoid.
  const ready = desktop && Boolean(workspaceId) && workspaceSettingsLoaded && userSettingsFetched;

  useEffect(() => {
    if (!ready || triggerState !== "offer" || !meetCode || !workspaceId) return;
    if (handled.current === meetCode) return;

    const plan = planBridgeClaim({
      meetCode,
      allowedLanguages: workspaceSettings?.allowedTargetLanguages ?? [],
      settingsSpeak: userSettings?.defaultSpeakLanguage,
      settingsListen: userSettings?.defaultListenLanguage,
      locales: typeof navigator === "undefined" ? [] : navigator.languages,
    });
    if (plan.kind === "wait") return;

    handled.current = meetCode;

    // Text-only bridge (PO, 2026-10-01): a machine with no cable starts the sitting in text mode,
    // where voice is impossible anyway. Otherwise nothing is sent and the server keeps the mode this
    // participant already has — voice on a first claim, or a text pick made in the popup before a
    // reload (see claimAudioModeFor). The popup's start step changes it before Start.
    readVirtualAudioStatus()
      .then((status) => claimAudioModeFor(status))
      .catch(() => undefined)
      .then((audioMode) =>
        translationRoomService.claimBridgeRoom({
          workspaceId,
          ...plan.body,
          ...(audioMode ? { audioMode } : {}),
        }),
      )
      .then((claim) => {
        setCapturerEntry(claim.room.id, {
          role: claim.bridgeRole,
          heartbeatIntervalSeconds: claim.heartbeatIntervalSeconds,
          leaseSeconds: claim.leaseSeconds,
        });
        setAudioMode(claim.room.id, claim.audioMode);
        openMeeting(claim.room.id);
        // The room list feeds the trigger: until it has this room, the call is still an "offer".
        void queryClient.invalidateQueries({ queryKey: ["translationRooms"] });
      })
      .catch((error: unknown) => {
        announceFailure(
          getErrorMessage(error, "WarpTalk could not join a meeting for this call."),
        );
      });
  }, [ready, triggerState, meetCode, workspaceSettings, userSettings, workspaceId, openMeeting, setCapturerEntry, setAudioMode, queryClient]);
}

function announceFailure(reason: string) {
  const title = "WarpTalk cannot translate this call";
  toast.error(title, { description: reason });
  try {
    if (typeof Notification !== "undefined" && Notification.permission !== "denied") {
      new Notification(title, { body: reason });
    }
  } catch {
    // A notification is a courtesy on top of the toast; a platform without one loses nothing else.
  }
}
