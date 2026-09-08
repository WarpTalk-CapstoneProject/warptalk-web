"use client";

/**
 * Flow 2: WarpTalk noticed a Google Meet call that no room accounts for.
 *
 * This is the whole of the consent gate. Nothing has been created, nothing is being listened to,
 * and nothing will be until the button below is pressed - a window title matching a regex is not
 * a mandate to write to the user's workspace. It renders inside the floating always-on-top window,
 * so from the user's side it is a modal over their Meet call.
 *
 * The languages are asked for here rather than defaulted, because there is no honest default: an
 * impromptu call is exactly the case where WarpTalk knows nothing about who is on it.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SUPPORTED_LANGUAGES } from "@/lib/language/languages";
import { activateBridgeRoom } from "@/lib/desktop/bridge";
import { EXTERNAL_BRIDGE_TYPE } from "@/lib/meeting/meeting-types";
import { useCreateTranslationRoom } from "@/hooks/use-translationRooms";
import { useWorkspaceSettings } from "@/hooks/use-workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";

/** Translating needs two. One language is a recording, not a bridge. */
const MINIMUM_LANGUAGES = 2;

export default function DesktopBridgeOfferPage() {
  const router = useRouter();
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const { data: settings } = useWorkspaceSettings(activeWorkspaceId || "");
  const createRoom = useCreateTranslationRoom();

  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () => SUPPORTED_LANGUAGES.filter((language) => language.scopes.includes("meeting")),
    [],
  );

  /**
   * WT-500's per-meeting quota, enforced here instead of at the point of refusal.
   *
   * The server rejects a meeting that declares more languages than the plan allows, and that
   * refusal used to arrive with nothing to connect it to. In a 460px window over someone's live
   * call it would be worse than unhelpful, so the ceiling caps the picker instead.
   */
  const ceiling = settings?.maxLanguagesCeiling ?? null;
  const atCeiling = ceiling !== null && ceiling > 0 && selected.length >= ceiling;

  function toggle(locale: string) {
    setError(null);
    setSelected((current) =>
      current.includes(locale)
        ? current.filter((entry) => entry !== locale)
        : atCeiling
          ? current
          : [...current, locale],
    );
  }

  async function handleAccept() {
    setError(null);
    if (!activeWorkspaceId) {
      setError("No workspace is selected. Open WarpTalk and pick one, then try again.");
      return;
    }
    if (selected.length < MINIMUM_LANGUAGES) {
      setError(`Pick at least ${MINIMUM_LANGUAGES} languages so there is something to translate between.`);
      return;
    }

    try {
      const room = await createRoom.mutateAsync({
        workspaceId: activeWorkspaceId,
        title: "Google Meet call",
        translationRoomType: EXTERNAL_BRIDGE_TYPE,
        // The backend still models a (source, targets) pair; the create dialog derives them the
        // same way, so an impromptu room is shaped exactly like a scheduled one.
        sourceLanguage: selected[0],
        targetLanguages: selected,
      });

      // The popup cannot start translating on its own - the pipeline lives in the main window.
      await activateBridgeRoom(room.id);
      router.replace(`/desktop-transcript/${room.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "That meeting could not be created. Open WarpTalk to see why.",
      );
    }
  }

  return (
    <main className="flex h-dvh flex-col gap-4 bg-surface-1 p-5 text-ink">
      <header className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
          Google Meet detected
        </p>
        <h1 className="text-[15px] font-semibold leading-snug">
          Translate this call with WarpTalk?
        </h1>
        <p className="text-[11px] leading-relaxed text-ink-muted">
          WarpTalk saw a Google Meet window. Nothing is being recorded or listened to yet. Accepting
          creates a meeting in your workspace and starts translating.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        <p className="text-[11px] font-medium text-ink">
          Languages spoken on this call
          {ceiling !== null && ceiling > 0 ? (
            <span className="font-normal text-ink-muted"> — up to {ceiling}</span>
          ) : null}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {options.map((language) => {
            const isSelected = selected.includes(language.locale);
            return (
              <button
                key={language.locale}
                type="button"
                aria-pressed={isSelected}
                disabled={!isSelected && atCeiling}
                onClick={() => toggle(language.locale)}
                className={[
                  "rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isSelected
                    ? "border-primary bg-primary/10 font-medium text-ink"
                    : "border-border text-ink-muted hover:border-ink/30 hover:text-ink",
                  !isSelected && atCeiling ? "cursor-not-allowed opacity-40 hover:border-border" : "",
                ].join(" ")}
              >
                {language.name}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[11px] leading-relaxed text-danger">
          {error}
        </p>
      ) : null}

      <footer className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void handleAccept()}
          disabled={createRoom.isPending}
          className="h-9 flex-1 rounded-lg bg-ink text-[12px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {createRoom.isPending ? "Setting up…" : "Translate this call"}
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="h-9 rounded-lg border border-border px-3 text-[12px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Not now
        </button>
      </footer>
    </main>
  );
}
