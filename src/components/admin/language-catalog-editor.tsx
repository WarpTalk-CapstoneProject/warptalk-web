"use client";

/**
 * WT-691: managing the language catalog room validation reads.
 *
 * Two dialogs, in the same shape as the user-action and pricing dialogs: add/rename a language,
 * and switch one on or off. There is no delete — disabling is the soft switch, and a meeting that
 * already ran in a language keeps naming it.
 *
 * Every change is recorded in the platform audit log by the server BEFORE it is saved, and refused
 * when it cannot be recorded; so a failure here means nothing changed, which is what the error copy
 * says. The usage rules (live meetings block a disable, scheduled ones need a confirmation, the last
 * enabled language stays) are the server's; `disableDecision` only shows them before the click.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useCreateAdminLanguage,
  useSetAdminLanguageActive,
  useUpdateAdminLanguage,
} from "@/hooks/use-admin-configuration";
import { getErrorMessage } from "@/lib/api/errors";
import {
  disableDecision,
  normalizeLanguageCode,
  validateLanguageDraft,
} from "@/lib/language/admin-language-form";
import type { AdminSupportedLanguageDto } from "@/types/admin-configuration";

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
    >
      <WarningCircle size={14} weight="duotone" className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

// ── add / edit ───────────────────────────────────────────────────────────────

/** `language` null = add; a row = edit that row (its code is fixed). */
export function LanguageFormDialog({
  open,
  language,
  catalog,
  onOpenChange,
}: {
  open: boolean;
  language: AdminSupportedLanguageDto | null;
  catalog: AdminSupportedLanguageDto[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-md">
        {open ? (
          <LanguageForm
            key={language?.code ?? "new"}
            language={language}
            catalog={catalog}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LanguageForm({
  language,
  catalog,
  onDone,
}: {
  language: AdminSupportedLanguageDto | null;
  catalog: AdminSupportedLanguageDto[];
  onDone: () => void;
}) {
  const t = useTranslations("adminPlansSettings.settings.languageCatalog.manage.form");
  const create = useCreateAdminLanguage();
  const update = useUpdateAdminLanguage();
  const editing = language !== null;
  const [code, setCode] = useState(language?.code ?? "");
  const [name, setName] = useState(language?.name ?? "");
  const [nativeName, setNativeName] = useState(language?.nativeName ?? "");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isSaving = create.isPending || update.isPending;

  const handleSave = async () => {
    const problem = validateLanguageDraft({ code, name, nativeName }, catalog, editing);
    if (problem) {
      setError(t(`errors.${problem.error}`, { code: problem.coveredBy ?? "" }));
      return;
    }

    try {
      setError(null);
      if (language) {
        await update.mutateAsync({
          code: language.code,
          request: { name: name.trim(), nativeName: nativeName.trim() || null },
        });
        toast.success(t("savedToast", { code: language.code }));
      } else {
        const created = await create.mutateAsync({
          code: normalizeLanguageCode(code) ?? code.trim(),
          name: name.trim(),
          nativeName: nativeName.trim() || null,
          isActive,
        });
        toast.success(t("createdToast", { code: created.code }));
      }
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, t("genericError")));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{language ? t("editTitle", { code: language.code }) : t("addTitle")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-3">
        <div>
          <Label htmlFor="language-code" className="text-[12px] text-ink-muted">
            {t("codeLabel")}
          </Label>
          <Input
            id="language-code"
            className="mt-1.5 font-mono"
            value={code}
            disabled={editing}
            onChange={(event) => setCode(event.target.value)}
            placeholder="de-DE"
            autoComplete="off"
          />
          {!editing ? <p className="mt-1 text-[11px] text-ink-subtle">{t("codeHint")}</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="language-name" className="text-[12px] text-ink-muted">
              {t("nameLabel")}
            </Label>
            <Input
              id="language-name"
              className="mt-1.5"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="German"
            />
          </div>
          <div>
            <Label htmlFor="language-native-name" className="text-[12px] text-ink-muted">
              {t("nativeNameLabel")}
            </Label>
            <Input
              id="language-native-name"
              className="mt-1.5"
              value={nativeName}
              onChange={(event) => setNativeName(event.target.value)}
              placeholder="Deutsch"
            />
          </div>
        </div>
        {!editing ? (
          <label className="flex items-center justify-between gap-3 rounded-lg border border-hairline/60 px-3 py-2.5">
            <span className="text-[13px] text-ink">{t("enabledLabel")}</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>
        ) : null}

        <ErrorLine message={error} />
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onDone} disabled={isSaving}>
          {t("cancel")}
        </Button>
        <Button onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? t("saving") : editing ? t("save") : t("create")}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── enable / disable ─────────────────────────────────────────────────────────

export function LanguageToggleDialog({
  language,
  activeCount,
  onOpenChange,
}: {
  /** Null while closed. The action is the opposite of its current state. */
  language: AdminSupportedLanguageDto | null;
  activeCount: number;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={language !== null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-md">
        {language ? (
          <ToggleForm
            key={`${language.code}:${language.isActive}`}
            language={language}
            activeCount={activeCount}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ToggleForm({
  language,
  activeCount,
  onDone,
}: {
  language: AdminSupportedLanguageDto;
  activeCount: number;
  onDone: () => void;
}) {
  const t = useTranslations("adminPlansSettings.settings.languageCatalog.manage.toggle");
  const setActive = useSetAdminLanguageActive();
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabling = language.isActive;
  const decision = disabling ? disableDecision(language, activeCount) : { kind: "free" as const };
  const refused = decision.kind === "blocked" || decision.kind === "last";
  const needsAck = decision.kind === "confirm";

  const handleConfirm = async () => {
    try {
      setError(null);
      await setActive.mutateAsync({
        code: language.code,
        isActive: !disabling,
        confirmUpcoming: needsAck && acknowledged,
      });
      toast.success(t(disabling ? "disabledToast" : "enabledToast", { code: language.code }));
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, t("genericError")));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(disabling ? "disableTitle" : "enableTitle", { name: language.name })}</DialogTitle>
        <DialogDescription>
          {t(disabling ? "disableDescription" : "enableDescription", { code: language.code })}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-3">
        {decision.kind === "blocked" ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {t("blocked", { count: decision.live })}
          </p>
        ) : decision.kind === "last" ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {t("last")}
          </p>
        ) : decision.kind === "confirm" ? (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-[12px] text-amber-800 dark:text-amber-200">
            <p>{t("confirmUpcoming", { count: decision.upcoming, code: language.code })}</p>
            <label className="mt-2 flex items-center gap-2 text-ink">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(checked) => setAcknowledged(checked === true)}
              />
              {t("confirmCheckbox")}
            </label>
          </div>
        ) : null}

        <ErrorLine message={error} />
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onDone} disabled={setActive.isPending}>
          {t("cancel")}
        </Button>
        <Button
          variant={disabling ? "destructive" : "default"}
          onClick={() => void handleConfirm()}
          disabled={setActive.isPending || refused || (needsAck && !acknowledged)}
        >
          {setActive.isPending ? t("pending") : t(disabling ? "confirmDisable" : "confirmEnable")}
        </Button>
      </DialogFooter>
    </>
  );
}
