"use client";

/**
 * "Voice clone mode" — the host records which Meet-side people agreed to have their voice cloned
 * for this meeting. WT-933. The last block of the widget's Voice sub-panel, for the room host of
 * an EXTERNAL_BRIDGE room only.
 *
 * THE DECISION (PO, 2026-10-03)
 *   The host asks the people in the call, pastes the notice below into Meet's chat, and ticks the
 *   names of the people who said yes. Unticking withdraws, and the worker deletes that person's
 *   voice copy. Nothing is cloned for a name nobody ticked.
 *
 * WHAT THE SWITCH IS
 *   Screen state: it opens the notice and the list, and is remembered per room in localStorage
 *   (the room id only, never a name). It gates nothing on the server, so turning it OFF withdraws
 *   nobody — the ticks are the consent, and the hint under the list says so. Hiding the list with
 *   the switch and saying so was chosen over a greyed-out list: a disabled list of ticked names
 *   reads as "cloning is paused", which is not true.
 *
 * WHERE THE STATE LIVES
 *   On the server, per name. The list is the caption names on the stand-in's transcript lines
 *   (lib/meeting/bridge-voice-clone-consent); which of them are ticked is asked whenever that set
 *   changes and when the block opens, and never assumed: a name whose answer has not come yet has
 *   a disabled box rather than an empty one, because an empty box on a person who agreed is a
 *   false reading that the next click would turn into a withdrawal.
 *
 * Called from this window, not relayed, like Flash mode: the value is server-side and the main
 * window holds no copy of it.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/api/errors";
import { consentedAmong, meetSideVoiceCloneNames } from "@/lib/meeting/bridge-voice-clone-consent";
import { isExternalBridge } from "@/lib/meeting/meeting-types";
import { translationRoomService } from "@/services/translation-room.service";

import { useBridgeWidget } from "../widget-context";

/** The room id and nothing else: a person's name is never written to storage. */
function storageKey(roomId: string): string {
  return `warptalk:bridge-voice-clone-mode:${roomId}`;
}

function readModeOn(roomId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(roomId)) === "1";
  } catch {
    // Storage refused (private mode, policy): the mode starts off, as it does for a new room.
    return false;
  }
}

function writeModeOn(roomId: string, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(storageKey(roomId), "1");
    else window.localStorage.removeItem(storageKey(roomId));
  } catch {
    // Not remembered; the switch still works for as long as the popup is open.
  }
}

/** How long the Copy button says "Copied". */
const COPIED_FEEDBACK_MS = 2_000;

export function VoiceCloneModeBlock() {
  const { roomId, room, isHost } = useBridgeWidget();
  if (!isHost || !isExternalBridge(room?.translationRoomType) || room?.status === "ended") return null;
  // Keyed by room so the remembered switch and the ticks of one room never show for another.
  return <VoiceCloneMode key={roomId} roomId={roomId} />;
}

function VoiceCloneMode({ roomId }: { roomId: string }) {
  const t = useTranslations("rooms.bridgeWidget.voiceCloneMode");
  const { segments } = useBridgeWidget();
  const labelId = useId();
  const descriptionId = useId();
  const peopleId = useId();

  const [on, setOn] = useState(() => readModeOn(roomId));

  // `segments` is rebuilt on every transcript tick; the key only changes when a new person speaks.
  const names = useMemo(() => meetSideVoiceCloneNames(segments), [segments]);
  const namesKey = JSON.stringify(names);

  /** The names the server has answered for, and the ones it holds a consent for. */
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  /** Names with a tick or untick on its way; the box waits, and a status answer does not overwrite it. */
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set());
  const savingRef = useRef<Set<string>>(new Set());
  const [statusFailed, setStatusFailed] = useState(false);
  const [statusAttempt, setStatusAttempt] = useState(0);

  useEffect(() => {
    if (!on) return;
    const asked = JSON.parse(namesKey) as string[];
    if (asked.length === 0) return;
    let cancelled = false;
    translationRoomService
      .getBridgeVoiceCloneConsentStatus(roomId, asked)
      .then((status) => {
        if (cancelled) return;
        const consented = new Set(consentedAmong(asked, status.consented));
        setTicked((current) => {
          const next = new Set<string>();
          for (const name of asked) {
            // A click made while this was out is newer than the answer.
            const value = savingRef.current.has(name) ? current.has(name) : consented.has(name);
            if (value) next.add(name);
          }
          return next;
        });
        setAnswered(new Set(asked));
        setStatusFailed(false);
      })
      .catch(() => {
        if (!cancelled) setStatusFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [on, roomId, namesKey, statusAttempt]);

  function setSavingName(name: string, isSaving: boolean) {
    if (isSaving) savingRef.current.add(name);
    else savingRef.current.delete(name);
    setSaving(new Set(savingRef.current));
  }

  function setTick(name: string, consented: boolean) {
    setTicked((current) => {
      const next = new Set(current);
      if (consented) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  function record(name: string, consented: boolean) {
    if (savingRef.current.has(name)) return;
    setSavingName(name, true);
    // Shown at once, and put back if the server refuses.
    setTick(name, consented);
    translationRoomService
      .setBridgeVoiceCloneConsent(roomId, name, consented)
      .then((result) => setTick(name, result.consented))
      .catch((error: unknown) => {
        setTick(name, !consented);
        toast.error(getErrorMessage(error, t("saveFailed")));
      })
      .finally(() => setSavingName(name, false));
  }

  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  async function copyNotice() {
    try {
      await navigator.clipboard.writeText(t("notice"));
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      // Clipboard access can be refused; the notice is selectable, so it can be copied by hand.
      toast.error(t("copyFailed"));
    }
  }

  return (
    <div className="mx-2.5 mb-2 border-t border-surface-3 pt-2">
      <div className="flex w-full items-start justify-between gap-3">
        <span className="min-w-0 text-left">
          <span id={labelId} className="block text-[13px] font-medium text-ink">
            {t("label")}
          </span>
          <span id={descriptionId} className="block text-[11px] leading-snug text-ink-subtle">
            {t("description")}
          </span>
        </span>
        <Switch
          size="sm"
          className="mt-0.5 shrink-0"
          checked={on}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          onCheckedChange={(checked) => {
            const next = Boolean(checked);
            setOn(next);
            writeModeOn(roomId, next);
          }}
        />
      </div>

      {on ? (
        <>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              {t("noticeLabel")}
            </p>
            <button
              type="button"
              onClick={() => void copyNotice()}
              className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {copied ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Copy className="h-3 w-3" aria-hidden="true" />
              )}
              <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
            </button>
          </div>
          <p className="mt-1 select-text rounded-md bg-surface-2 px-2.5 py-2 text-[11px] leading-snug text-ink-muted">
            {t("notice")}
          </p>

          <p
            id={peopleId}
            className="mt-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle"
          >
            {t("peopleLabel")}
          </p>
          {names.length === 0 ? (
            <p className="mt-1 text-[11px] leading-snug text-ink-muted">{t("empty")}</p>
          ) : (
            <ul aria-labelledby={peopleId} className="mt-1 space-y-0.5">
              {names.map((name) => (
                <li key={name}>
                  <label className="flex items-center gap-2 rounded-md px-1 py-1 text-[12px] text-ink">
                    <Checkbox
                      checked={ticked.has(name)}
                      disabled={!answered.has(name) || saving.has(name)}
                      onCheckedChange={(checked) => record(name, checked === true)}
                    />
                    <span className="min-w-0 truncate">{name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {statusFailed && names.length > 0 ? (
            <p role="status" className="mt-1 text-[11px] leading-snug text-ink-muted">
              {t("statusFailed")}{" "}
              <button
                type="button"
                onClick={() => setStatusAttempt((attempt) => attempt + 1)}
                className="font-medium text-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t("retry")}
              </button>
            </p>
          ) : null}

          <p className="mt-2 text-[11px] leading-snug text-ink-subtle">{t("hint")}</p>
        </>
      ) : null}
    </div>
  );
}
