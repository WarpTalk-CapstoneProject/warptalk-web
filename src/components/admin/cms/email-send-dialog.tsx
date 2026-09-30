"use client";

/**
 * Send a custom email template to an audience — the only way a template an admin created goes
 * out, apart from an announcement's email channel.
 *
 * Three steps: who (the announcement targeting rules), what (the template's own variables, typed,
 * pre-filled with their samples), and a confirmation that states the real number of people, the
 * languages they get, who is skipped, and how long it takes at the server's rate. The server
 * re-counts on start and refuses a number that moved; it sends only published content and logs
 * every recipient (the Sends tab).
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PaperPlaneTilt, UsersThree, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { PlanPicker, WorkspacePicker } from "@/components/admin/cms/audience-pickers";
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
import { Textarea } from "@/components/ui/textarea";
import { useEmailSendEstimate, useStartEmailSend } from "@/hooks/use-admin-email-sends";
import { RECIPIENT_DRIFT_TOLERANCE, sendDurationMinutes, sendValueError } from "@/lib/admin/email-library";
import { AUDIENCE_MODES, LOCALES, ROLES, toUtcIso, type AudienceMode } from "@/lib/announcements/announcement-cms";
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { EmailAudienceDto, EmailCampaignDto, EmailSendEstimateDto, EmailTemplateListItemDto } from "@/types/admin-cms";

type Step = "audience" | "values" | "confirm";

interface AudienceState {
  mode: AudienceMode;
  planSlugs: string[];
  workspaceIds: string[];
  roles: string[];
  locales: string[];
  newUsersWithinDays: string;
  scheduledAt: string;
}

function toAudience(state: AudienceState): EmailAudienceDto {
  const days = Number.parseInt(state.newUsersWithinDays, 10);
  return {
    mode: state.mode,
    planSlugs: state.mode === "PLANS" ? state.planSlugs : [],
    workspaceIds: state.mode === "WORKSPACES" ? state.workspaceIds : [],
    roles: state.roles,
    locales: state.locales,
    newUsersWithinDays: state.newUsersWithinDays.trim() && Number.isFinite(days) ? days : null,
  };
}

export function EmailSendDialog({
  open,
  onOpenChange,
  template,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EmailTemplateListItemDto;
  onStarted?: (campaign: EmailCampaignDto) => void;
}) {
  const t = useTranslations("adminCms.library.send");
  const tTarget = useTranslations("adminCms.announcements.editor");
  const [step, setStep] = useState<Step>("audience");
  const [audience, setAudience] = useState<AudienceState>({
    mode: "ALL",
    planSlugs: [],
    workspaceIds: [],
    roles: [],
    locales: [],
    newUsersWithinDays: "",
    scheduledAt: "",
  });
  const declared = useMemo(() => template.variables.filter((variable) => !variable.implicit), [template.variables]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(declared.map((variable) => [variable.name, variable.sample])),
  );
  const [estimate, setEstimate] = useState<EmailSendEstimateDto | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const estimateMutation = useEmailSendEstimate();
  const start = useStartEmailSend();

  // "In the past" is checked when moving on (an event), not while rendering: the clock is not render state.
  const [pastError, setPastError] = useState(false);
  const audienceError =
    audience.mode === "PLANS" && audience.planSlugs.length === 0
      ? t("errors.plans")
      : audience.mode === "WORKSPACES" && audience.workspaceIds.length === 0
        ? t("errors.workspaces")
        : pastError
          ? t("errors.past")
          : null;
  const valueErrors = Object.fromEntries(
    declared.map((variable) => {
      const value = values[variable.name] ?? "";
      if (variable.required && !value.trim()) return [variable.name, t("errors.required")];
      const error = sendValueError(variable.type ?? "TEXT", value);
      return [variable.name, error ? t(`errors.${error}`) : null];
    }),
  );
  const valuesValid = Object.values(valueErrors).every((error) => !error);
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const reset = () => {
    setStep("audience");
    setEstimate(null);
    setAcknowledged(false);
  };

  const goToConfirm = async () => {
    try {
      const result = await estimateMutation.mutateAsync({ key: template.key, audience: toAudience(audience) });
      setEstimate(result);
      setAcknowledged(false);
      setStep("confirm");
    } catch (caught) {
      toast.error(getErrorMessage(caught, t("estimateFailed")));
    }
  };

  const submit = async () => {
    if (!estimate) return;
    try {
      const campaign = await start.mutateAsync({
        key: template.key,
        request: {
          audience: toAudience(audience),
          values,
          expectedRecipients: estimate.recipients,
          scheduledAt: audience.scheduledAt ? toUtcIso(audience.scheduledAt) : null,
        },
      });
      toast.success(audience.scheduledAt ? t("scheduled") : t("started", { count: estimate.recipients }));
      reset();
      onOpenChange(false);
      onStarted?.(campaign);
    } catch (caught) {
      toast.error(getErrorMessage(caught, t("startFailed")));
      // The audience moved since the estimate: count again so the admin confirms the real number.
      if (apiErrorCode(caught) === 409) void goToConfirm();
    }
  };

  const minutes = estimate ? sendDurationMinutes(estimate.recipients, estimate.sendsPerMinute) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title", { name: template.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-2 text-[11.5px]" aria-label={t("steps")}>
          {(["audience", "values", "confirm"] as const).map((value, index) => (
            <li
              key={value}
              aria-current={step === value ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                step === value ? "border-ink bg-ink text-surface-1" : "border-border text-ink-muted",
              )}
            >
              <span className="tabular-nums">{index + 1}</span>
              {t(`stepNames.${value}`)}
            </li>
          ))}
        </ol>

        {step === "audience" ? (
          <div className="space-y-4">
            <div role="radiogroup" aria-label={t("who")} className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
              {AUDIENCE_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={audience.mode === mode}
                  onClick={() => setAudience({ ...audience, mode })}
                  className={cn(
                    "min-w-0 rounded-lg border px-3 py-2 text-left",
                    audience.mode === mode ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2",
                  )}
                >
                  <span className="block text-[13px] font-medium">{tTarget(`audienceModes.${mode}.label`)}</span>
                  <span className={cn("block text-[11px]", audience.mode === mode ? "text-surface-1/70" : "text-ink-subtle")}>
                    {tTarget(`audienceModes.${mode}.hint`)}
                  </span>
                </button>
              ))}
            </div>
            {audience.mode === "PLANS" ? (
              <PlanPicker selected={audience.planSlugs} onChange={(planSlugs) => setAudience({ ...audience, planSlugs })} />
            ) : null}
            {audience.mode === "WORKSPACES" ? (
              <WorkspacePicker selected={audience.workspaceIds} onChange={(workspaceIds) => setAudience({ ...audience, workspaceIds })} />
            ) : null}
            <div>
              <p className="text-[12px] text-ink-muted">{tTarget("targeting.roles")}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ROLES.map((role) => (
                  <Pill key={role} on={audience.roles.includes(role)} onClick={() => setAudience({ ...audience, roles: toggle(audience.roles, role) })}>
                    {tTarget(`targeting.roleNames.${role}`)}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[12px] text-ink-muted">{tTarget("targeting.locales")}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {LOCALES.map((locale) => (
                  <Pill key={locale} on={audience.locales.includes(locale)} onClick={() => setAudience({ ...audience, locales: toggle(audience.locales, locale) })}>
                    {tTarget(`targeting.localeNames.${locale}`)}
                  </Pill>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="send-new-users" className="text-[12px] text-ink-muted">
                  {tTarget("targeting.newUsers")}
                </Label>
                <Input
                  id="send-new-users"
                  type="number"
                  min={1}
                  max={365}
                  className="mt-1.5"
                  placeholder={tTarget("targeting.newUsersPlaceholder")}
                  value={audience.newUsersWithinDays}
                  onChange={(event) => setAudience({ ...audience, newUsersWithinDays: event.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="send-at" className="text-[12px] text-ink-muted">
                  {t("when")}
                </Label>
                <Input
                  id="send-at"
                  type="datetime-local"
                  className="mt-1.5"
                  value={audience.scheduledAt}
                  onChange={(event) => {
                    setPastError(false);
                    setAudience({ ...audience, scheduledAt: event.target.value });
                  }}
                />
                <p className="mt-1 text-[11.5px] text-ink-subtle">{t("whenHint")}</p>
              </div>
            </div>
            {audienceError ? <p className="text-[12px] text-destructive">{audienceError}</p> : null}
          </div>
        ) : null}

        {step === "values" ? (
          <div className="space-y-3">
            {declared.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">{t("noValues")}</p>
            ) : (
              declared.map((variable) => (
                <div key={variable.name}>
                  <Label htmlFor={`value-${variable.name}`} className="text-[12px] text-ink-muted">
                    {variable.label || variable.name}
                    {variable.required ? <span className="text-destructive"> *</span> : null}
                  </Label>
                  {variable.type === "MULTILINE" ? (
                    <Textarea
                      id={`value-${variable.name}`}
                      className="mt-1 min-h-[72px] text-[13px]"
                      value={values[variable.name] ?? ""}
                      onChange={(event) => setValues({ ...values, [variable.name]: event.target.value })}
                    />
                  ) : (
                    <Input
                      id={`value-${variable.name}`}
                      type={variable.type === "URL" ? "url" : variable.type === "NUMBER" ? "text" : variable.type === "DATE" ? "date" : "text"}
                      inputMode={variable.type === "NUMBER" ? "decimal" : undefined}
                      className="mt-1 text-[13px]"
                      value={values[variable.name] ?? ""}
                      onChange={(event) => setValues({ ...values, [variable.name]: event.target.value })}
                    />
                  )}
                  {valueErrors[variable.name] ? <p className="mt-1 text-[11.5px] text-destructive">{valueErrors[variable.name]}</p> : null}
                </div>
              ))
            )}
            <p className="text-[11.5px] text-ink-subtle">{t("automatic")}</p>
          </div>
        ) : null}

        {step === "confirm" && estimate ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3">
              <UsersThree size={20} className="mt-0.5 shrink-0 text-ink-muted" />
              <div className="text-[13px]">
                <p className="font-semibold text-ink">{t("reaches", { count: estimate.recipients })}</p>
                <p className="mt-0.5 text-ink-muted">
                  {estimate.byLocale.map((row) => `${row.locale.toUpperCase()} ${row.count.toLocaleString()}`).join(" · ")}
                </p>
                {estimate.skippedOptedOut > 0 ? <p className="mt-0.5 text-ink-muted">{t("optedOut", { count: estimate.skippedOptedOut })}</p> : null}
                {estimate.fallbackLocales.length > 0 ? (
                  <p className="mt-0.5 text-ink-muted">{t("fallback", { locales: estimate.fallbackLocales.map((l) => l.toUpperCase()).join(", ") })}</p>
                ) : null}
                <p className="mt-0.5 text-ink-muted">
                  {audience.scheduledAt ? t("startsAt", { date: new Date(toUtcIso(audience.scheduledAt) ?? "").toLocaleString() }) : t("duration", { minutes, rate: estimate.sendsPerMinute })}
                </p>
              </div>
            </div>
            {estimate.recipients === 0 ? (
              <p className="flex items-center gap-2 text-[12.5px] text-destructive">
                <WarningCircle size={16} /> {t("nobody")}
              </p>
            ) : (
              <label className="flex items-start gap-2 text-[12.5px] text-ink">
                <Checkbox checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(Boolean(checked))} className="mt-0.5" />
                {t("acknowledge", { count: estimate.recipients })}
              </label>
            )}
            <p className="text-[11.5px] text-ink-subtle">{t("recount", { tolerance: RECIPIENT_DRIFT_TOLERANCE })}</p>
          </div>
        ) : null}

        <DialogFooter>
          {step !== "audience" ? (
            <Button variant="outline" onClick={() => setStep(step === "confirm" ? "values" : "audience")}>
              {t("back")}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
          )}
          {step === "audience" ? (
            <Button
              disabled={Boolean(audienceError)}
              onClick={() => {
                if (audience.scheduledAt && Date.parse(toUtcIso(audience.scheduledAt) ?? "") < Date.now()) {
                  setPastError(true);
                  return;
                }
                setStep("values");
              }}
            >
              {t("next")}
            </Button>
          ) : step === "values" ? (
            <Button disabled={!valuesValid || estimateMutation.isPending} onClick={() => void goToConfirm()}>
              {estimateMutation.isPending ? t("counting") : t("review")}
            </Button>
          ) : (
            <Button disabled={!estimate || estimate.recipients === 0 || !acknowledged || start.isPending} onClick={() => void submit()}>
              <PaperPlaneTilt size={14} />
              {audience.scheduledAt ? t("schedule", { count: estimate?.recipients ?? 0 }) : t("send", { count: estimate?.recipients ?? 0 })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("rounded-full border px-3 py-1 text-[12px]", on ? "border-ink bg-ink text-surface-1" : "border-border hover:bg-surface-2")}
    >
      {children}
    </button>
  );
}
