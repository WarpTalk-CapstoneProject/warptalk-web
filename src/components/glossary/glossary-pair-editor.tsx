"use client";

/**
 * PO 2026-10-02 — change the open glossary's language pair after creation.
 *
 * Somebody who imported a dictionary as English → English and meant English → Vietnamese used to
 * have to create a new glossary and import again. Now the pair is two selects beside the
 * glossary's name, offered from the languages the platform admin has published (the same list the
 * Import template tab uses). The terms are NOT re-translated or changed; when the glossary
 * already has terms the change waits for a one-line confirmation in the page saying so (no
 * window.confirm). Afterwards the chip moves to its new pair group, and the Import dialog's quick
 * download and the Import template tab follow the new pair (both read the glossary's pair).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Spinner } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePublishedTemplateLanguages } from "@/hooks/use-glossary-import-template";
import { useUpdateGlossaryLanguages } from "@/hooks/use-workspace";
import { getErrorMessage } from "@/lib/api/errors";
import { baseLanguage } from "@/lib/glossary/import-template";
import { getLanguageName } from "@/lib/language/languages";
import type { GlossaryDto } from "@/types/workspace";

type Pair = { sourceLanguage: string; targetLanguage: string };

export function GlossaryPairEditor({
  workspaceId,
  glossary,
  termCount,
  canManage,
}: {
  workspaceId: string;
  glossary: GlossaryDto;
  termCount: number;
  canManage: boolean;
}) {
  const t = useTranslations("glossary.pairEditor");
  const { languages, isLoading } = usePublishedTemplateLanguages();
  const update = useUpdateGlossaryLanguages(workspaceId);
  const [pending, setPending] = useState<Pair | null>(null);

  const current: Pair = {
    sourceLanguage: baseLanguage(glossary.sourceLanguage),
    targetLanguage: baseLanguage(glossary.targetLanguage),
  };
  const nameOf = (code: string) =>
    languages.find((language) => language.code === code)?.name ?? getLanguageName(code);

  // A pair the admin has since unpublished is still shown as the current value.
  const options = [...languages];
  for (const code of [current.sourceLanguage, current.targetLanguage]) {
    if (code && !options.some((language) => language.code === code)) options.push({ code, name: nameOf(code) });
  }

  const apply = async (pair: Pair) => {
    try {
      await update.mutateAsync({ id: glossary.id, ...pair });
      setPending(null);
      toast.success(t("changed", { source: nameOf(pair.sourceLanguage), target: nameOf(pair.targetLanguage) }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("changeFailed")));
    }
  };

  const choose = (pair: Pair) => {
    if (pair.sourceLanguage === current.sourceLanguage && pair.targetLanguage === current.targetLanguage) {
      setPending(null);
      return;
    }
    if (termCount > 0) setPending(pair);
    else void apply(pair);
  };

  const shown = pending ?? current;

  if (!canManage) {
    return (
      <span className="text-[12px] text-ink-muted">
        {nameOf(current.sourceLanguage)} → {nameOf(current.targetLanguage)}
      </span>
    );
  }

  const select = (value: string, label: string, onPick: (code: string) => void) => (
    <Select value={value} onValueChange={(code) => code && onPick(code)} disabled={isLoading || update.isPending}>
      <SelectTrigger className="h-7 w-36 text-[12px]" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((language) => (
          <SelectItem key={language.code} value={language.code}>
            {language.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-[11.5px] text-ink-subtle">{t("label")}</span>
      {select(shown.sourceLanguage, t("source"), (code) => choose({ ...shown, sourceLanguage: code }))}
      <ArrowRight className="h-3 w-3 text-ink-subtle" />
      {select(shown.targetLanguage, t("target"), (code) => choose({ ...shown, targetLanguage: code }))}
      {update.isPending && !pending ? <Spinner className="h-3.5 w-3.5 animate-spin text-ink-subtle" /> : null}
      {pending ? (
        <span role="alert" className="flex flex-wrap items-center gap-2 text-[12px] text-ink">
          {t("confirm", { source: nameOf(pending.sourceLanguage), target: nameOf(pending.targetLanguage) })}
          <Button size="sm" className="h-7 shadow-none" onClick={() => void apply(pending)} disabled={update.isPending}>
            {update.isPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("confirmButton")}
          </Button>
          <Button size="sm" variant="outline" className="h-7 shadow-none" onClick={() => setPending(null)}>
            {t("cancel")}
          </Button>
        </span>
      ) : null}
    </div>
  );
}
