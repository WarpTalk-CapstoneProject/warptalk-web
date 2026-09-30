"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useCreateTranslationRoom } from "@/hooks/use-translationRooms";
import { useUserSettings } from "@/hooks/use-user-settings";
import { useWorkspaceSettings } from "@/hooks/use-workspace";
import { getErrorMessage } from "@/lib/api/errors";
import { isDesktopApp } from "@/lib/desktop/bridge";
import {
  planBridgeAutoRoom,
  type BridgeAutoRoomCandidate,
} from "@/lib/meeting/bridge-auto-room";
import type { BridgeTriggerState } from "@/lib/meeting/bridge-trigger";
import { useActiveMeetingStore } from "@/stores/active-meeting-store";

/**
 * The impure half of bridge-auto-room.ts: when the desktop sees a Google Meet call with no room
 * behind it, make (or reuse) the room and hand it to this window's meeting session.
 *
 * Handing it over is all that is needed to reach the transcript popup: the meeting session opens
 * the popup for any bridge room it carries (persistent-meeting-session.tsx), and the popup's dock
 * is where the language is picked and translation is started.
 *
 * ONE ATTEMPT PER CALL
 *   The trigger stays in `offer` for as long as Meet is on screen and the room list has not caught
 *   up, which is several renders. `handled` keys on the Meet code, so a call gets one create - and a
 *   refusal is shown once, not every three seconds. A different call is a new attempt.
 *
 * WHERE A FAILURE IS SHOWN
 *   The user is looking at Google Meet, not at this window, so a toast alone would go unseen. A
 *   system notification is raised as well; Electron shows it natively without asking.
 */
export function useBridgeAutoRoom({
  triggerState,
  meetCode,
  rooms,
  workspaceId,
  canCreateMeetings,
}: {
  triggerState: BridgeTriggerState;
  meetCode?: string | null;
  rooms: readonly BridgeAutoRoomCandidate[];
  workspaceId: string | null;
  canCreateMeetings: boolean | null;
}) {
  const openMeeting = useActiveMeetingStore((state) => state.openMeeting);
  const createRoom = useCreateTranslationRoom();
  const { data: workspaceSettings, isSuccess: workspaceSettingsLoaded } = useWorkspaceSettings(
    workspaceId ?? "",
  );
  const { data: userSettings, isFetched: userSettingsFetched } = useUserSettings();
  const handled = useRef<string | null>(null);

  const desktop = isDesktopApp();
  // Waiting on the language inputs, not guessing without them: a room created before the
  // workspace's language list arrives is the 403 this flow exists to avoid.
  const ready = desktop && Boolean(workspaceId) && workspaceSettingsLoaded && userSettingsFetched;

  useEffect(() => {
    if (!ready || triggerState !== "offer" || !meetCode) return;
    if (handled.current === meetCode) return;

    const plan = planBridgeAutoRoom({
      meetCode,
      rooms,
      canCreateMeetings,
      allowedLanguages: workspaceSettings?.allowedTargetLanguages ?? [],
      settingsSpeak: userSettings?.defaultSpeakLanguage,
      settingsListen: userSettings?.defaultListenLanguage,
      locales: typeof navigator === "undefined" ? [] : navigator.languages,
    });
    if (plan.kind === "wait") return;

    handled.current = meetCode;

    if (plan.kind === "reuse") {
      openMeeting(plan.roomId);
      return;
    }
    if (plan.kind === "refuse") {
      announceFailure(plan.reason);
      return;
    }

    createRoom
      .mutateAsync({ workspaceId: workspaceId!, ...plan.request })
      .then((room) => openMeeting(room.id))
      .catch((error: unknown) => {
        announceFailure(
          getErrorMessage(error, "WarpTalk could not create a meeting for this call."),
        );
      });
    // `createRoom` is a new object every render; the attempt is keyed on the call, not on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, triggerState, meetCode, rooms, canCreateMeetings, workspaceSettings, userSettings, workspaceId, openMeeting]);
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
