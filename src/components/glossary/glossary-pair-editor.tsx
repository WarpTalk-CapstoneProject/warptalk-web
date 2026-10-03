"use client";

/**
 * PO 2026-10-02 — change the open glossary's language pair after creation.
 *
 * Somebody who imported a dictionary as English → English and meant English → Vietnamese used to
 * have to create a new glossary and import again. Now the pair is two selects beside the
 * glossary's name, offered from the languages the WORKSPACE allows (Settings → language policy,
 * the same list the New glossary dialog uses — see `pairEditorLanguageOptions`). They used to be
 * every language the platform admin had published, which let a workspace relabel a glossary into a
 * pair it may not create. The terms are NOT re-translated or changed; when the glossary
 * already has terms the change waits for a one-line confirmation in the page saying so (no
 * window.confirm). Afterwards the chip moves to its new pair group, and the Import dialog's quick
 * download and the Import template tab follow the new pair (both read the glossary's pair).
 *
 * WT-937: it is a RELABEL, and it has to look like one. Two always-live selects under the toolbar's
 * pair filter, showing bare codes ("en", "vi"), read as a second filter: QA "chose en-vi to view
 * it", confirmed, and saw the English-only terms of the glossary they had just relabelled — a swap
 * of data, as far as anyone could tell. So the pair is shown as text with a "Change pair" button,
 * the selects (named languages) appear only after it, and the confirmation says the terms are not
 * translated. `onChanged` lets the page follow the glossary to its new pair group.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, PencilSimple, Spinner } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateGlossaryLanguages } from "@/hooks/use-workspace";
import { getErrorMessage } from "@/lib/api/errors";
import { pairEditorLanguageOptions, type PairLanguageOption } from "@/lib/glossary/glossary-pairs";
import { baseLanguage } from "@/lib/glossary/import-template";
import { getLanguageName } from "@/lib/language/languages";
import type { GlossaryDto } from "@/types/workspace";

type Pair = { sourceLanguage: string; targetLanguage: string };

export function GlossaryPairEditor({
  workspaceId,
  glossary,
  termCount,
  canManage,
  languages,
  languagesReady,
  onChanged,
}: {
  workspaceId: string;
  glossary: GlossaryDto;
  termCount: number;
  canManage: boolean;
  /** The languages the workspace's policy allows. */
  languages: readonly PairLanguageOption[];
  /** False until the policy has settled; the selects wait rather than offer a forbidden language. */
  languagesReady: boolean;
  onChanged?: (pair: Pair) => void;
}) {
  const t = useTranslations("glossary.pairEditor");
  const update = useUpdateGlossaryLanguages(workspaceId);
  const [pending, setPending] = useState<Pair | null>(null);
  const [editing, setEditing] = useState(false);

  const current: Pair = {
    sourceLanguage: baseLanguage(glossary.sourceLanguage),
    targetLanguage: baseLanguage(glossary.targetLanguage),
  };
  const nameOf = (code: string) =>
    languages.find((language) => language.code === code)?.name ?? getLanguageName(code);

  const options = pairEditorLanguageOptions(
    languages,
    [current.sourceLanguage, current.targetLanguage],
    nameOf,
  );

  const apply = async (pair: Pair) => {
    try {
      await update.mutateAsync({ id: glossary.id, ...pair });
      setPending(null);
      setEditing(false);
      onChanged?.(pair);
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

  const currentLabel = (
    <span className="text-[12px] text-ink-muted" data-testid="glossary-pair-current">
      {nameOf(current.sourceLanguage)} → {nameOf(current.targetLanguage)}
    </span>
  );

  if (!canManage) return currentLabel;

  if (!editing) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        {currentLabel}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[12px] text-ink-muted shadow-none"
          onClick={() => setEditing(true)}
        >
          <PencilSimple className="h-3.5 w-3.5" />
          {t("edit")}
        </Button>
      </div>
    );
  }

  const select = (value: string, label: string, onPick: (code: string) => void) => (
    <Select value={value} onValueChange={(code) => code && onPick(code)} disabled={!languagesReady || update.isPending}>
      {/* size="sm": the trigger's own `data-[size=default]:h-9` outranks a bare `h-7`. */}
      <SelectTrigger size="sm" className="w-36 py-0 text-[12px]" aria-label={label}>
        <SelectValue>{(code) => (code ? nameOf(String(code)) : "")}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((language) => (
          <SelectItem key={language.code} value={language.code} className="text-[12px]">
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
          {t("confirm", {
            source: nameOf(pending.sourceLanguage),
            target: nameOf(pending.targetLanguage),
            count: termCount,
          })}
          <Button size="sm" className="h-7 shadow-none" onClick={() => void apply(pending)} disabled={update.isPending}>
            {update.isPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : null}
            {t("confirmButton")}
          </Button>
        </span>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="h-7 shadow-none"
        onClick={() => {
          setPending(null);
          setEditing(false);
        }}
        disabled={update.isPending}
      >
        {t("cancel")}
      </Button>
    </div>
  );
}
