"use client";

import { Devices } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

/**
 * Shown in place of the meeting when the same account joined it from another device or tab and
 * this session was evicted (see @/lib/meeting/session-displacement).
 *
 * It replaces "Could not reach the media server" + "Retry connection", which was what this state
 * used to look like — wrong about the cause, and the retry it offered was the very thing that kept
 * evicting the other device. The one action here is a deliberate take-over: it reconnects this
 * window, which evicts the other one, and the other one then shows this same notice.
 *
 * `overlay` covers a positioned stage (the camera view, or the mini window); `card` sits inline in
 * the external-bridge widget, which has no stage.
 */
export function DisplacedSessionNotice({
  variant,
  onTakeOver,
}: {
  variant: "overlay" | "compact-overlay" | "card";
  onTakeOver: () => void;
}) {
  const t = useTranslations("meetingCallChrome.displaced");

  if (variant === "card") {
    return (
      <div
        role="alert"
        data-session-displaced
        className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-3"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-ink">
          <Devices className="size-3.5 shrink-0 text-amber-600" aria-hidden="true" />
          {t("title")}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">{t("description")}</p>
        <button
          type="button"
          onClick={onTakeOver}
          className="mt-3 flex h-8 w-full items-center justify-center rounded-lg bg-primary px-3 text-[11px] font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t("takeOver")}
        </button>
      </div>
    );
  }

  const compact = variant === "compact-overlay";

  return (
    <div
      role="alert"
      data-session-displaced
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center text-center ${
        compact ? "gap-2 bg-black/80 px-5 text-white" : "gap-3 bg-surface-1/95 px-6 text-ink backdrop-blur-sm"
      }`}
    >
      {compact ? null : (
        <div className="grid size-12 place-items-center rounded-full bg-surface-3 text-ink-muted">
          <Devices className="size-6" aria-hidden="true" />
        </div>
      )}
      <p className={compact ? "text-[13px] font-semibold" : "max-w-md text-[15px] font-semibold"}>
        {t("title")}
      </p>
      <p
        className={
          compact
            ? "max-w-60 text-[11px] leading-relaxed text-white/70"
            : "max-w-md text-[13px] leading-relaxed text-ink-subtle"
        }
      >
        {t("description")}
      </p>
      <button
        type="button"
        onClick={onTakeOver}
        className={
          compact
            ? "mt-1 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-900 transition hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            : "mt-1 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        }
      >
        {t("takeOver")}
      </button>
    </div>
  );
}
