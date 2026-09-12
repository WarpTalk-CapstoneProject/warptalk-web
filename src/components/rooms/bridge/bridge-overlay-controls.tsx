"use client";

/**
 * The controls WT-525 asked for, on the window that floats over Google Meet. WT-577.
 *
 * WHY THEY CAN LIVE IN A SECOND WINDOW AT ALL
 *   The popup is a separate Electron BrowserWindow. It shares an origin with the main window and
 *   therefore a session, but not React state: the audio pipeline, the LiveKit connection and every
 *   `useState` in the meeting belong to the window that opened the room, and nothing here can
 *   reach them.
 *
 *   What it can reach is the server, and all four controls turn out to be server-side facts:
 *   translation is running exactly while the room has an ACTIVE session row, the dub voice is a
 *   setting in AuthService, and clone consent is a per-room audio-route flag. So each control is
 *   the same mutation the in-meeting control bar fires, and the main window learns what happened
 *   the same way any other participant does — by polling the sessions list. No shared store, and
 *   no second source of truth to drift.
 *
 *   With one exception, and it is the one that makes the rest mean anything: the main window only
 *   polls, joins and carries audio for a room it has been told to open. Start therefore asks it
 *   to, over the same IPC relay flow 2 uses, before the session is opened. See
 *   startBridgeTranslation for why that has to come first.
 *
 * THE ONE CONTROL THAT IS NOT A SERVER FACT
 *   The Windows loopback consent is not on the server and cannot be: it is per meeting and per
 *   machine, and it gates a capture that lives inside the main window's PersistentMeetingSession.
 *   So there is nothing here to mutate and nothing to poll. The main window publishes its consent
 *   state on a BroadcastChannel and this window posts back what the host pressed — the same
 *   one-source-of-truth rule as the rest of the strip, reached over a different wire because the
 *   truth is in the other window rather than in the database. See `BridgeCaptureConsentPanel`.
 *
 * WHY START/STOP IS HOST-ONLY HERE
 *   `/resume` — the endpoint that opens a translation session — gates on IsHostedBy. WT-371's
 *   "participants may start translation" rule lives on a different endpoint that no UI calls, so
 *   offering the button to a non-host would produce a 403 and a toast about permissions in a
 *   460px window over someone's live call. A bridge room has two seats and the host is the person
 *   sitting at this machine, so this is nearly always moot — but "nearly" is why it is checked.
 *
 * WHY THE WHOLE THING CAN RENDER NOTHING
 *   Until the room query answers there is no honest state to draw: a Start button rendered before
 *   we know whether translation is already running is a control that lies for a second and then
 *   changes its mind.
 */

import { useMemo, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";

import { BridgeCaptureConsentPanel } from "@/components/rooms/bridge/bridge-capture-consent-panel";
import { Switch } from "@/components/ui/switch";
import { activateBridgeRoom } from "@/lib/desktop/bridge";
import { getLanguageName } from "@/lib/language/languages";
import { startBridgeTranslation } from "@/lib/meeting/bridge-overlay-start";
import { useAuthStore } from "@/stores/auth-store";
import {
  useResumeTranslationRoom,
  useSetVoiceCloneConsent,
  useStartTranslationRoom,
  useStopTranslation,
  useTranslationRoom,
  useTranslationRoomSessions,
  useRefreshDubVoice,
} from "@/hooks/use-translationRooms";
import {
  useDubVoice,
  useSetDubVoice,
  useVoiceCatalog,
  useVoiceProfiles,
} from "@/hooks/use-voice-profiles";

/** A `<select>` cannot hold null, and "" is how a browser reports "nothing chosen". */
const LIVE_CLONE = "__live_clone__";

export function BridgeOverlayControls({
  roomId,
  /**
   * Whether the user has consented to being cloned in THIS room.
   *
   * Lifted to the page because there is no endpoint that reads it back — the flag is written to
   * the audio route and never returned — so the switch's position is remembered by whoever holds
   * the state, and nothing can re-derive it after a reload. The main window has the same gap and
   * solves it the same way (see `voiceCloneEnabled` in persistent-meeting-session).
   */
  voiceCloneEnabled,
  onVoiceCloneEnabledChange,
}: {
  roomId: string;
  voiceCloneEnabled: boolean;
  onVoiceCloneEnabledChange: (enabled: boolean) => void;
}) {
  const { data: room } = useTranslationRoom(roomId);
  const { data: sessions } = useTranslationRoomSessions(roomId);
  const user = useAuthStore((state) => state.user);
  const translationStarted = (sessions ?? []).some((session) => session.status === "ACTIVE");
  /**
   * Both halves, as every other host check in the app does it.
   *
   * `isHost` is optional on the DTO — not every endpoint that returns a room fills it in — so a
   * host whose payload happens to omit it would be shown the "waiting for the host" sentence in
   * their own meeting, with no way to start the translation they came here to start. `hostId`
   * against the signed-in user is the half that is always there.
   */
  const isHost = Boolean(user?.id && room?.hostId === user.id) || room?.isHost === true;

  const startRoom = useStartTranslationRoom();
  const resumeRoom = useResumeTranslationRoom();
  const stopTranslation = useStopTranslation();

  const language = room?.sourceLanguage ?? "";
  const { data: profiles } = useVoiceProfiles();
  const { data: catalog = [] } = useVoiceCatalog(language, Boolean(language));
  const { data: dubVoice } = useDubVoice();
  const setDubVoice = useSetDubVoice();
  const refreshDubVoice = useRefreshDubVoice(roomId);
  const setVoiceCloneConsent = useSetVoiceCloneConsent(roomId);

  // Only profiles with a provider voice behind them: an uploaded recording has none until it has
  // been cloned, and offering one would let somebody pick a voice that cannot be spoken.
  const ownVoices = useMemo(
    () =>
      (profiles ?? [])
        .filter((profile) => profile.providerVoiceId && profile.isActive)
        .map((profile) => ({
          id: profile.providerVoiceId!,
          name: profile.displayName || "My voice",
        })),
    [profiles],
  );

  /**
   * The whole Start sequence, not just its mutations: activation is awaited before either of them
   * is pending, and a second press in that gap would ask the main window twice and open the room
   * twice.
   */
  const [starting, setStarting] = useState(false);
  const busy =
    starting || startRoom.isPending || resumeRoom.isPending || stopTranslation.isPending;

  async function toggleTranslation() {
    if (!room) return;
    if (translationStarted) {
      stopTranslation.mutate(room.id, {
        onSuccess: () => toast.success("Translation stopped. The transcript keeps running."),
        onError: (error) =>
          toast.error(error instanceof Error ? error.message : "Failed to stop translation."),
      });
      return;
    }

    setStarting(true);
    try {
      // Activate, then open the ROOM if nobody has, then /resume. The order is the point; it lives
      // in startBridgeTranslation so a test can hold it there.
      const { activated } = await startBridgeTranslation(room, {
        activate: activateBridgeRoom,
        openRoom: (id) => startRoom.mutateAsync(id),
        startTranslation: (id) => resumeRoom.mutateAsync(id),
      });
      if (activated) {
        toast.success("Translation started.");
      } else {
        // Said, not swallowed: without the main window this is the old bug - a session marked
        // running that nothing is feeding - and the one thing the user can do about it is open the
        // meeting there themselves.
        toast.warning("Translation started, but WarpTalk could not open this meeting.", {
          description: "Open it in the WarpTalk window so your voice and the dub are carried.",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start translation.");
    } finally {
      setStarting(false);
    }
  }

  function chooseVoice(value: string) {
    const voiceId = value === LIVE_CLONE ? null : value;
    setDubVoice.mutate(
      // A voice of your own is accepted without a language; a catalogue pick is validated against
      // one — see VoiceProfileService.IsVoiceChoosableByAsync.
      { voiceId, language: ownVoices.some((voice) => voice.id === voiceId) ? null : language },
      {
        onSuccess: async () => {
          try {
            // The setting lives in AuthService, which knows nothing about rooms. Without this the
            // choice is correct everywhere except the meeting the person is standing in.
            await refreshDubVoice.mutateAsync();
          } catch {
            toast.error("Saved, but this meeting may keep the old voice until you rejoin.");
            return;
          }
          toast.success(voiceId ? "You will be dubbed in this voice." : "Back to cloning you live.");
        },
        onError: () => toast.error("Could not change the voice you are dubbed in."),
      },
    );
  }

  function toggleClone(enabled: boolean) {
    const previous = voiceCloneEnabled;
    onVoiceCloneEnabledChange(enabled); // optimistic; there is nothing to read it back from
    setVoiceCloneConsent.mutate(enabled, {
      onError: () => {
        onVoiceCloneEnabledChange(previous);
        toast.error("Could not update voice clone consent.");
      },
    });
  }

  if (!room) return null;

  return (
    <section className="shrink-0 space-y-2.5 border-b border-border px-4 py-3">
      {isHost ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleTranslation()}
          className="flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-[11px] font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : translationStarted ? (
            <Square className="size-3" fill="currentColor" aria-hidden="true" />
          ) : (
            <Play className="size-3" fill="currentColor" aria-hidden="true" />
          )}
          {translationStarted ? "Stop translation" : "Start translation"}
        </button>
      ) : (
        // Not a disabled button. A control that exists and refuses reads as broken; a sentence
        // reads as somebody else's job, which is what it is.
        <p className="text-[11px] leading-relaxed text-ink-muted">
          {translationStarted
            ? "Translation is running. The host can stop it."
            : "Waiting for the host to start translation."}
        </p>
      )}

      {/* Directly under Start, because pressing Start is what raises the question: the inbound leg
          asks for the loopback the moment it is asked to carry the far side. */}
      <BridgeCaptureConsentPanel roomId={roomId} />

      <label className="flex items-center gap-2 text-[11px]">
        <span className="shrink-0 text-ink-muted">Your voice</span>
        <select
          // A native select, not the app's Radix one. This window is 460px wide and always on top:
          // a portalled listbox has nowhere to open, while the OS menu a native select raises is
          // not bound by the window at all.
          value={dubVoice ?? LIVE_CLONE}
          onChange={(event) => chooseVoice(event.target.value)}
          disabled={setDubVoice.isPending}
          aria-label="The voice you are dubbed in"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface-1 px-1.5 text-[11px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <option value={LIVE_CLONE}>Clone my voice live</option>
          {ownVoices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name}
            </option>
          ))}
          {catalog.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name} · {getLanguageName(language)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[11px] text-ink-muted">
          Clone my voice
          {/*
            Said out loud because the precedence is invisible and surprising: a chosen voice wins
            over a live clone in the TTS worker, so leaving a library voice selected while turning
            this on produces the library voice and a user certain that cloning is broken.
          */}
          {dubVoice ? (
            <span className="block text-[10px] leading-tight text-ink-subtle">
              A picked voice is used instead. Choose &ldquo;Clone my voice live&rdquo; above to hear
              the clone.
            </span>
          ) : null}
        </span>
        <Switch
          checked={voiceCloneEnabled}
          onCheckedChange={toggleClone}
          disabled={setVoiceCloneConsent.isPending}
          aria-label="Clone my voice in this meeting"
        />
      </div>
    </section>
  );
}
