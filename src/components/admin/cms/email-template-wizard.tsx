"use client";

/**
 * "New template": the five steps to an email an admin owns.
 *
 *   1 Basics     name, key (suggested from the name, unique), category, description
 *   2 Layout     which published layout it is poured into (thumbnails, not code)
 *   3 Variables  what it can say beyond the recipient's name — typed, with sample values
 *   4 Content    subject, preheader, heading and body, in English and optionally Vietnamese and Japanese
 *   5 Review     then Save draft
 *
 * It is saved as drafts: nothing is sent until it is published, and a custom template has no code
 * sender — it goes out through "Send email" to an audience, or as an announcement's email.
 */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, FloppyDisk, Plus, Trash } from "@phosphor-icons/react/dist/ssr";

import { BlockThumbnail } from "@/components/admin/cms/email-thumbnail";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { useEmailBlocks } from "@/hooks/use-admin-email-blocks";
import { useCreateCustomEmail } from "@/hooks/use-admin-email-templates";
import {
  CUSTOM_CATEGORIES,
  draftBodyDocument,
  implicitVariables,
  suggestKey,
  VARIABLE_TYPES,
  WIZARD_STEPS,
  wizardErrors,
  writtenLocales,
  type WizardLocale,
  type WizardState,
  type WizardStep,
} from "@/lib/admin/email-library";
import { insertAt, placeholder } from "@/lib/admin/email-template-editor";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

const EMPTY_CONTENT: WizardLocale[] = (["en", "vi", "ja"] as const).map((locale) => ({
  locale,
  subject: "",
  preheader: "",
  heading: "",
  bodyHtml: "",
}));

function initialState(): WizardState {
  return {
    name: "",
    key: "",
    category: "MARKETING",
    description: "",
    layoutId: null,
    variables: [],
    content: EMPTY_CONTENT.map((c) =>
      c.locale === "en" ? { ...c, bodyHtml: "<p>Hi {{RecipientName}},</p>\n<p></p>" } : c,
    ),
  };
}

export function EmailTemplateWizard({
  open,
  onOpenChange,
  takenKeys,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every key in use (built-in, custom, archived): a new one must differ. */
  takenKeys: ReadonlySet<string>;
}) {
  const t = useTranslations("adminCms.library.wizard");
  const router = useRouter();
  const create = useCreateCustomEmail();
  const [step, setStep] = useState<WizardStep>("basics");
  const [state, setState] = useState<WizardState>(initialState);
  const [keyTouched, setKeyTouched] = useState(false);
  const [locale, setLocale] = useState<WizardLocale["locale"]>("en");
  // Problems are shown once someone tries to move on, not while they are still typing the first field.
  const [attempted, setAttempted] = useState<ReadonlySet<WizardStep>>(new Set());
  const errors = useMemo(() => wizardErrors(state, takenKeys), [state, takenKeys]);
  const index = WIZARD_STEPS.indexOf(step);

  const set = (patch: Partial<WizardState>) => setState((current) => ({ ...current, ...patch }));
  const setName = (name: string) => set(keyTouched ? { name } : { name, key: suggestKey(name, takenKeys) });

  const close = () => {
    onOpenChange(false);
    setStep("basics");
    setState(initialState());
    setKeyTouched(false);
    setLocale("en");
    setAttempted(new Set());
  };

  const save = async () => {
    try {
      const detail = await create.mutateAsync({
        key: state.key,
        name: state.name.trim(),
        description: state.description.trim() || null,
        category: state.category,
        layoutId: state.layoutId,
        variables: state.variables.map((variable) => ({
          name: variable.name.trim(),
          label: variable.label.trim() || null,
          type: variable.type,
          sample: variable.sample,
          required: variable.required,
        })),
        content: writtenLocales(state.content).map((c) => ({
          locale: c.locale,
          subject: c.subject,
          preheader: c.preheader || null,
          heading: c.heading || null,
          bodyHtml: c.bodyHtml,
          textBody: null,
        })),
      });
      toast.success(t("created"));
      close();
      router.push(`/admin/email-templates/${encodeURIComponent(detail.template.key)}`);
    } catch (caught) {
      toast.error(getErrorMessage(caught, t("createFailed")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : onOpenChange(next))}>
      <DialogContent className="flex max-h-[92vh] w-[min(860px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
          <ol className="mt-3 flex flex-wrap gap-1.5" aria-label={t("stepsLabel")}>
            {WIZARD_STEPS.map((value, position) => {
              const hasErrors = value !== "review" && errors[value].length > 0 && (position < index || attempted.has(value));
              return (
                <li key={value}>
                  <button
                    type="button"
                    onClick={() => setStep(value)}
                    aria-current={step === value ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px]",
                      step === value ? "border-ink bg-ink text-surface-1" : "border-border text-ink-muted hover:bg-surface-2",
                      hasErrors && step !== value && "border-destructive/40 text-destructive",
                    )}
                  >
                    <span className="tabular-nums">{position < index && !hasErrors ? <Check size={11} /> : position + 1}</span>
                    {t(`steps.${value}`)}
                  </button>
                </li>
              );
            })}
          </ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === "basics" ? (
            <Basics
              state={state}
              setName={setName}
              set={set}
              setKey={(key) => {
                setKeyTouched(true);
                set({ key });
              }}
              errors={attempted.has("basics") ? errors.basics : []}
            />
          ) : null}
          {step === "layout" ? <LayoutStep state={state} set={set} /> : null}
          {step === "variables" ? <VariablesStep state={state} set={set} errors={attempted.has("variables") ? errors.variables : []} /> : null}
          {step === "content" ? (
            <ContentStep state={state} set={set} locale={locale} setLocale={setLocale} errors={attempted.has("content") ? errors.content : []} />
          ) : null}
          {step === "review" ? <Review state={state} errors={errors.review} /> : null}
        </div>

        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="outline" onClick={index === 0 ? close : () => setStep(WIZARD_STEPS[index - 1])}>
            {index === 0 ? t("cancel") : t("back")}
          </Button>
          {step === "review" ? (
            <Button disabled={errors.review.length > 0 || create.isPending} onClick={() => void save()}>
              <FloppyDisk size={14} />
              {create.isPending ? t("saving") : t("saveDraft")}
            </Button>
          ) : (
            <Button
              onClick={() => {
                if (errors[step].length > 0) {
                  setAttempted(new Set([...attempted, step]));
                  return;
                }
                setStep(WIZARD_STEPS[index + 1]);
              }}
            >
              {t("next")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ErrorList({ errors }: { errors: readonly string[] }) {
  const t = useTranslations("adminCms.library.wizard.errors");
  if (errors.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
      {errors.map((error) => (
        <li key={error}>{t(error)}</li>
      ))}
    </ul>
  );
}

function Basics({
  state,
  set,
  setName,
  setKey,
  errors,
}: {
  state: WizardState;
  set: (patch: Partial<WizardState>) => void;
  setName: (name: string) => void;
  setKey: (key: string) => void;
  errors: string[];
}) {
  const t = useTranslations("adminCms.library.wizard");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="wizard-name" className="text-[12px] text-ink-muted">
            {t("name")}
          </Label>
          <Input id="wizard-name" className="mt-1.5" maxLength={120} value={state.name} placeholder={t("namePlaceholder")} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="wizard-key" className="text-[12px] text-ink-muted">
            {t("key")}
          </Label>
          <Input
            id="wizard-key"
            className="mt-1.5 font-mono text-[12.5px]"
            maxLength={60}
            value={state.key}
            onChange={(event) => setKey(event.target.value.toLowerCase())}
          />
          <p className="mt-1 text-[11.5px] text-ink-subtle">{t("keyHint")}</p>
        </div>
      </div>
      <div>
        <p className="text-[12px] text-ink-muted">{t("category")}</p>
        <div role="radiogroup" aria-label={t("category")} className="mt-1.5 grid gap-2 sm:grid-cols-3">
          {CUSTOM_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              role="radio"
              aria-checked={state.category === category}
              onClick={() => set({ category })}
              className={cn(
                "rounded-lg border px-3 py-2 text-left",
                state.category === category ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2",
              )}
            >
              <span className="block text-[13px] font-medium">{t(`categories.${category}.label`)}</span>
              <span className={cn("mt-0.5 block text-[11px]", state.category === category ? "text-surface-1/70" : "text-ink-subtle")}>
                {t(`categories.${category}.hint`)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="wizard-description" className="text-[12px] text-ink-muted">
          {t("descriptionLabel")}
        </Label>
        <Input id="wizard-description" className="mt-1.5" maxLength={500} value={state.description} onChange={(event) => set({ description: event.target.value })} />
      </div>
      <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] text-ink-muted">{t("howItSends")}</p>
      <ErrorList errors={errors} />
    </div>
  );
}

function LayoutStep({ state, set }: { state: WizardState; set: (patch: Partial<WizardState>) => void }) {
  const t = useTranslations("adminCms.library.wizard");
  const layouts = useEmailBlocks("LAYOUT");
  const usable = (layouts.data ?? []).filter((layout) => layout.status === "ACTIVE" && layout.publishedVersion > 0);
  const options = [{ id: null as string | null, name: t("defaultLayout"), description: t("defaultLayoutHint") }, ...usable.map((layout) => ({ id: layout.id as string | null, name: layout.name, description: layout.description ?? "" }))];
  return (
    <div role="radiogroup" aria-label={t("steps.layout")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {options.map((option) => (
        <button
          key={option.id ?? "default"}
          type="button"
          role="radio"
          aria-checked={state.layoutId === option.id}
          onClick={() => set({ layoutId: option.id })}
          className={cn(
            "overflow-hidden rounded-lg border text-left transition-colors",
            state.layoutId === option.id ? "border-ink ring-1 ring-ink" : "border-border hover:border-ink/30",
          )}
        >
          {option.id ? (
            <BlockThumbnail blockId={option.id} label={option.name} height={140} />
          ) : (
            <div className="flex h-[140px] items-center justify-center bg-surface-2 text-[12px] text-ink-muted">{t("builtInLayout")}</div>
          )}
          <div className="px-3 py-2">
            <span className="block text-[13px] font-medium text-ink">{option.name}</span>
            {option.description ? <span className="block truncate text-[11.5px] text-ink-subtle">{option.description}</span> : null}
          </div>
        </button>
      ))}
    </div>
  );
}

function VariablesStep({ state, set, errors }: { state: WizardState; set: (patch: Partial<WizardState>) => void; errors: string[] }) {
  const t = useTranslations("adminCms.library.wizard");
  const update = (index: number, patch: Partial<WizardState["variables"][number]>) =>
    set({ variables: state.variables.map((variable, i) => (i === index ? { ...variable, ...patch } : variable)) });
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] text-ink-muted">{t("automaticVariables")}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {implicitVariables(state.category).map((variable) => (
            <span key={variable.name} className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[12px] text-ink-muted" title={variable.sample}>
              {t(`implicit.${variable.name}`)}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {state.variables.map((variable, index) => (
          <div key={index} className="grid items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_120px_1.2fr_auto_auto]">
            <div>
              <Label className="text-[11.5px] text-ink-muted">{t("variableName")}</Label>
              <Input className="mt-1 font-mono text-[12.5px]" value={variable.name} maxLength={40} onChange={(event) => update(index, { name: event.target.value.replace(/\s/g, "") })} />
            </div>
            <div>
              <Label className="text-[11.5px] text-ink-muted">{t("variableLabel")}</Label>
              <Input className="mt-1 text-[12.5px]" value={variable.label} maxLength={120} onChange={(event) => update(index, { label: event.target.value })} />
            </div>
            <div>
              <Label className="text-[11.5px] text-ink-muted">{t("variableType")}</Label>
              <select
                value={variable.type}
                onChange={(event) => update(index, { type: event.target.value as (typeof VARIABLE_TYPES)[number] })}
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
              <Input className="mt-1 text-[12.5px]" value={variable.sample} onChange={(event) => update(index, { sample: event.target.value })} />
            </div>
            <label className="flex h-8 items-center gap-1.5 text-[11.5px] text-ink-muted">
              <Switch checked={variable.required} onCheckedChange={(checked) => update(index, { required: Boolean(checked) })} />
              {t("variableRequired")}
            </label>
            <Button variant="ghost" size="icon-sm" aria-label={t("removeVariable")} onClick={() => set({ variables: state.variables.filter((_, i) => i !== index) })}>
              <Trash size={14} />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => set({ variables: [...state.variables, { name: "", label: "", type: "TEXT", sample: "", required: false }] })}
      >
        <Plus size={14} />
        {t("addVariable")}
      </Button>
      <ErrorList errors={errors} />
    </div>
  );
}

function ContentStep({
  state,
  set,
  locale,
  setLocale,
  errors,
}: {
  state: WizardState;
  set: (patch: Partial<WizardState>) => void;
  locale: WizardLocale["locale"];
  setLocale: (locale: WizardLocale["locale"]) => void;
  errors: string[];
}) {
  const t = useTranslations("adminCms.library.wizard");
  const body = useRef<HTMLTextAreaElement>(null);
  const [look, setLook] = useState(false);
  const current = state.content.find((c) => c.locale === locale)!;
  const samples = Object.fromEntries([
    ...implicitVariables(state.category).map((v) => [v.name, v.sample] as const),
    ...state.variables.filter((v) => v.name).map((v) => [v.name, v.sample || v.label || v.name] as const),
  ]);
  const update = (patch: Partial<WizardLocale>) =>
    set({ content: state.content.map((c) => (c.locale === locale ? { ...c, ...patch } : c)) });
  const names = [...implicitVariables(state.category).map((v) => v.name), ...state.variables.map((v) => v.name).filter(Boolean)];
  const insert = (name: string) => {
    const element = body.current;
    const next = insertAt(current.bodyHtml, element?.selectionStart ?? null, element?.selectionEnd ?? null, placeholder(name));
    update({ bodyHtml: next.value });
  };

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label={t("language")} className="flex gap-1">
        {state.content.map((c) => (
          <button
            key={c.locale}
            type="button"
            role="tab"
            aria-selected={locale === c.locale}
            onClick={() => setLocale(c.locale)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12.5px]",
              locale === c.locale ? "bg-ink font-medium text-surface-1" : "text-ink-muted hover:bg-surface-2",
            )}
          >
            {t(`languages.${c.locale}`)}
            {c.locale !== "en" && !c.subject.trim() && !c.bodyHtml.trim() ? <span className="ml-1 opacity-60">· {t("optional")}</span> : null}
          </button>
        ))}
      </div>
      {locale !== "en" ? <p className="text-[11.5px] text-ink-subtle">{t("fallbackHint")}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="wizard-subject" className="text-[12px] text-ink-muted">
            {t("subject")}
          </Label>
          <Input id="wizard-subject" className="mt-1.5" maxLength={200} value={current.subject} onChange={(event) => update({ subject: event.target.value })} />
        </div>
        <div>
          <Label htmlFor="wizard-preheader" className="text-[12px] text-ink-muted">
            {t("preheader")}
          </Label>
          <Input id="wizard-preheader" className="mt-1.5" maxLength={200} value={current.preheader} onChange={(event) => update({ preheader: event.target.value })} />
        </div>
      </div>
      <div>
        <Label htmlFor="wizard-heading" className="text-[12px] text-ink-muted">
          {t("heading")}
        </Label>
        <Input id="wizard-heading" className="mt-1.5" maxLength={200} value={current.heading} onChange={(event) => update({ heading: event.target.value })} />
      </div>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="wizard-body" className="text-[12px] text-ink-muted">
            {t("body")}
          </Label>
          <div className="flex flex-wrap gap-1">
            {names.map((name) => (
              <button
                key={name}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insert(name)}
                className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink hover:border-ink/30"
              >
                {placeholder(name)}
              </button>
            ))}
          </div>
        </div>
        <div role="tablist" aria-label={t("bodyView")} className="mt-1.5 flex gap-1">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              role="tab"
              aria-selected={look === value}
              onClick={() => setLook(value)}
              className={cn("rounded-md px-2 py-1 text-[12px] text-ink-muted", look === value && "bg-surface-2 font-medium text-ink")}
            >
              {value ? t("quickLook") : t("write")}
            </button>
          ))}
        </div>
        {look ? (
          <iframe
            title={t("quickLook")}
            sandbox=""
            srcDoc={draftBodyDocument(current.bodyHtml, current.heading, samples)}
            className="mt-1.5 h-[320px] w-full rounded-lg border border-border bg-[#FBF9F5]"
          />
        ) : (
          <Textarea
            id="wizard-body"
            ref={body}
            className="mt-1.5 min-h-[220px] font-mono text-[12.5px] leading-relaxed"
            value={current.bodyHtml}
            onChange={(event) => update({ bodyHtml: event.target.value })}
          />
        )}
        <p className="mt-1 text-[11.5px] text-ink-subtle">{t("bodyHint")}</p>
      </div>
      <ErrorList errors={errors} />
    </div>
  );
}

function Review({ state, errors }: { state: WizardState; errors: string[] }) {
  const t = useTranslations("adminCms.library.wizard");
  return (
    <div className="space-y-3 text-[13px]">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-[11.5px] text-ink-subtle">{t("name")}</dt>
          <dd className="text-ink">{state.name || "—"}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-ink-subtle">{t("key")}</dt>
          <dd className="font-mono text-[12.5px] text-ink">{state.key || "—"}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-ink-subtle">{t("category")}</dt>
          <dd className="text-ink">{t(`categories.${state.category}.label`)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] text-ink-subtle">{t("steps.variables")}</dt>
          <dd className="text-ink">{state.variables.length ? state.variables.map((v) => v.label || v.name).join(", ") : t("noVariables")}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11.5px] text-ink-subtle">{t("languagesWritten")}</dt>
          <dd className="text-ink">{writtenLocales(state.content).map((c) => t(`languages.${c.locale}`)).join(", ")}</dd>
        </div>
      </dl>
      <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] text-ink-muted">{t("reviewHint")}</p>
      <ErrorList errors={errors} />
    </div>
  );
}
