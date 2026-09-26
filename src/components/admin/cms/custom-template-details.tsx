"use client";

/**
 * A custom template's own settings: name, category, description and the variables a send asks
 * for. Content is edited per language on the Content tab, like any email.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FloppyDisk, Plus, Trash } from "@phosphor-icons/react/dist/ssr";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUpdateCustomEmailDetails } from "@/hooks/use-admin-email-templates";
import {
  CUSTOM_CATEGORIES,
  implicitVariables,
  VARIABLE_TYPES,
  wizardErrors,
  type CustomCategory,
  type VariableType,
  type WizardVariable,
} from "@/lib/admin/email-library";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { EmailTemplateListItemDto } from "@/types/admin-cms";

export function CustomTemplateDetails({ template, disabled }: { template: EmailTemplateListItemDto; disabled: boolean }) {
  const t = useTranslations("adminCms.library.wizard");
  const tDetails = useTranslations("adminCms.library.details");
  const update = useUpdateCustomEmailDetails();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [category, setCategory] = useState<CustomCategory>(
    (CUSTOM_CATEGORIES as readonly string[]).includes(template.category ?? "") ? (template.category as CustomCategory) : "TRANSACTIONAL_CUSTOM",
  );
  const [variables, setVariables] = useState<WizardVariable[]>(() =>
    template.variables
      .filter((variable) => !variable.implicit)
      .map((variable) => ({
        name: variable.name,
        label: variable.label ?? "",
        type: ((VARIABLE_TYPES as readonly string[]).includes(variable.type ?? "") ? variable.type : "TEXT") as VariableType,
        sample: variable.sample,
        required: variable.required,
      })),
  );
  const errors = wizardErrors(
    { name, key: template.key, category, description, layoutId: null, variables, content: [{ locale: "en", subject: "x", preheader: "", heading: "", bodyHtml: "x" }] },
    new Set(),
  );
  const problems = [...errors.basics.filter((error) => error !== "keyInvalid"), ...errors.variables];
  const set = (index: number, patch: Partial<WizardVariable>) => setVariables(variables.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  const save = async () => {
    try {
      await update.mutateAsync({
        key: template.key,
        request: {
          name: name.trim(),
          description: description.trim() || null,
          category,
          variables: variables.map((v) => ({ name: v.name.trim(), label: v.label.trim() || null, type: v.type, sample: v.sample, required: v.required })),
        },
      });
      toast.success(tDetails("saved"));
    } catch (caught) {
      toast.error(getErrorMessage(caught, tDetails("saveFailed")));
    }
  };

  return (
    <fieldset disabled={disabled} className="space-y-4 disabled:opacity-70">
      <AdminPanel className="grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="details-name" className="text-[12px] text-ink-muted">
            {t("name")}
          </Label>
          <Input id="details-name" className="mt-1.5" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <Label className="text-[12px] text-ink-muted">{t("key")}</Label>
          <p className="mt-2.5 font-mono text-[12.5px] text-ink-muted">{template.key}</p>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="details-description" className="text-[12px] text-ink-muted">
            {t("descriptionLabel")}
          </Label>
          <Input id="details-description" className="mt-1.5" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <p className="text-[12px] text-ink-muted">{t("category")}</p>
          <div role="radiogroup" aria-label={t("category")} className="mt-1.5 grid gap-2 sm:grid-cols-3">
            {CUSTOM_CATEGORIES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={category === value}
                onClick={() => setCategory(value)}
                className={cn("rounded-lg border px-3 py-2 text-left", category === value ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2")}
              >
                <span className="block text-[13px] font-medium">{t(`categories.${value}.label`)}</span>
                <span className={cn("mt-0.5 block text-[11px]", category === value ? "text-surface-1/70" : "text-ink-subtle")}>{t(`categories.${value}.hint`)}</span>
              </button>
            ))}
          </div>
        </div>
      </AdminPanel>

      <AdminPanel className="space-y-3 p-4">
        <div>
          <h3 className="text-[13px] font-semibold">{t("steps.variables")}</h3>
          <p className="mt-0.5 text-[12px] text-ink-muted">{tDetails("variablesHint")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {implicitVariables(category).map((variable) => (
            <span key={variable.name} className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[12px] text-ink-muted">
              {t(`implicit.${variable.name}`)}
            </span>
          ))}
        </div>
        {variables.map((variable, index) => (
          <div key={index} className="grid items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_120px_1.2fr_auto_auto]">
            <div>
              <Label className="text-[11.5px] text-ink-muted">{t("variableName")}</Label>
              <Input className="mt-1 font-mono text-[12.5px]" value={variable.name} maxLength={40} onChange={(event) => set(index, { name: event.target.value.replace(/\s/g, "") })} />
            </div>
            <div>
              <Label className="text-[11.5px] text-ink-muted">{t("variableLabel")}</Label>
              <Input className="mt-1 text-[12.5px]" value={variable.label} maxLength={120} onChange={(event) => set(index, { label: event.target.value })} />
            </div>
            <div>
              <Label className="text-[11.5px] text-ink-muted">{t("variableType")}</Label>
              <select
                value={variable.type}
                onChange={(event) => set(index, { type: event.target.value as VariableType })}
                className="mt-1 block h-8 w-full rounded-lg border border-border bg-surface-1 px-2 text-[12.5px] text-ink"
              >
                {VARIABLE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`types.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-[11.5px] text-ink-muted">{t("variableSample")}</Label>
              <Input className="mt-1 text-[12.5px]" value={variable.sample} onChange={(event) => set(index, { sample: event.target.value })} />
            </div>
            <label className="flex h-8 items-center gap-1.5 text-[11.5px] text-ink-muted">
              <Switch checked={variable.required} onCheckedChange={(checked) => set(index, { required: Boolean(checked) })} />
              {t("variableRequired")}
            </label>
            <Button variant="ghost" size="icon-sm" aria-label={t("removeVariable")} onClick={() => setVariables(variables.filter((_, i) => i !== index))}>
              <Trash size={14} />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setVariables([...variables, { name: "", label: "", type: "TEXT", sample: "", required: false }])}>
          <Plus size={14} />
          {t("addVariable")}
        </Button>
        {problems.length > 0 ? (
          <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {problems.map((problem) => (
              <li key={problem}>{t(`errors.${problem}`)}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex justify-end">
          <Button size="sm" disabled={problems.length > 0 || update.isPending} onClick={() => void save()}>
            <FloppyDisk size={14} />
            {tDetails("save")}
          </Button>
        </div>
      </AdminPanel>
    </fieldset>
  );
}
