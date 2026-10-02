"use client";

/**
 * PO 2026-10-02 — onboarding step "Set Up Glossary → Load Knowledge Into WarpBot".
 *
 * Shows, beside the open glossary's name, whether its terms are in WarpBot's knowledgebase:
 * "Loading into WarpBot knowledgebase…" while index results are outstanding, then "Ready in WarpBot
 * knowledgebase" or "Couldn't load into WarpBot knowledgebase", and raises one toast when a load
 * settles. The state is the server's (`GET /glossaries/{id}/warpbot-status`, index results counted
 * per glossary) — there is no timer here. With nothing sent recently the chip is absent: no claim.
 *
 * Mount with `key={glossaryId}` so the "previous status" used for the toast never crosses
 * glossaries.
 */

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, Spinner, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";

import { useGlossaryWarpBotStatus } from "@/hooks/use-workspace";
import {
  warpBotAnnouncement,
  warpBotStatusView,
  type GlossaryWarpBotStatus,
} from "@/lib/glossary/warpbot-status";

export function GlossaryWarpBotStatusChip({
  glossaryId,
  glossaryName,
}: {
  glossaryId: string;
  glossaryName: string;
}) {
  const t = useTranslations("glossary.warpbot");
  const { data } = useGlossaryWarpBotStatus(glossaryId);
  const previous = useRef<GlossaryWarpBotStatus | undefined>(undefined);

  useEffect(() => {
    if (!data) return;
    const announce = warpBotAnnouncement(previous.current, data);
    previous.current = data;
    if (announce === "ready") {
      toast.success(t("ready"), {
        id: `glossary-warpbot-${glossaryId}`,
        description: t("readyDescription", { name: glossaryName }),
      });
    } else if (announce === "failed") {
      const view = warpBotStatusView(data);
      toast.error(t("failed"), {
        id: `glossary-warpbot-${glossaryId}`,
        description:
          view.kind === "failed"
            ? t(view.unconfirmed ? "unconfirmedDetail" : "failedDetail", { count: view.count })
            : undefined,
      });
    }
  }, [data, glossaryId, glossaryName, t]);

  const view = warpBotStatusView(data);
  if (view.kind === "hidden") return null;

  const base =
    "inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium";

  if (view.kind === "loading") {
    return (
      <span
        role="status"
        className={`${base} border-amber-500/20 bg-amber-500/10 text-amber-600`}
        title={t("loadingProgress", { done: view.done, total: view.total })}
      >
        <Spinner className="h-3 w-3 shrink-0 animate-spin" />
        {t("loading")}
      </span>
    );
  }

  if (view.kind === "ready") {
    return (
      <span role="status" className={`${base} border-emerald-500/20 bg-emerald-500/10 text-emerald-600`}>
        <CheckCircle className="h-3 w-3 shrink-0" />
        {t("ready")}
      </span>
    );
  }

  const detail = t(view.unconfirmed ? "unconfirmedDetail" : "failedDetail", { count: view.count });
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span role="alert" className={`${base} border-destructive/20 bg-destructive/10 text-destructive`}>
        <Warning className="h-3 w-3 shrink-0" />
        {t("failed")}
      </span>
      <span className="text-[11.5px] text-ink-muted">{detail}</span>
    </span>
  );
}
