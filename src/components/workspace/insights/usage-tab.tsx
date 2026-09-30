"use client";

import { useTranslations } from "next-intl";

import type { InsightsTabProps } from "@/components/workspace/insights/insights-types";

/** Placeholder body; the real tab replaces it against the same prop contract. */
export function UsageTab(_props: InsightsTabProps) {
  const t = useTranslations("workspaceInsightsUsage");
  return <div>{t("title")}</div>;
}
