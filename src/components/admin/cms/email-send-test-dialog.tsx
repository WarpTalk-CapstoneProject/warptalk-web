"use client";

/**
 * Sends one email to up to five addresses, filled with a sample-data set, through the same
 * renderer and provider path the real senders use. Saves nothing: what is sent is the content
 * passed in (the editor's unsaved draft), or, from a list card, that locale's current draft.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminEmailTemplate, useSendTestEmail } from "@/hooks/use-admin-email-templates";
import { isEmailAddress, parseRecipients } from "@/lib/admin/email-template-editor";
import { getErrorMessage } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth-store";
import { EMAIL_LOCALES, type EmailContentFieldsDto } from "@/types/admin-cms";

const MAX_RECIPIENTS = 5;

export function SendTestEmailDialog({
  open,
  onOpenChange,
  templateKey,
  templateName,
  locale: initialLocale = "en",
  content,
  sampleSetId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateKey: string;
  templateName: string;
  locale?: string;
  /** The editor's unsaved fields. Absent: the chosen locale's saved draft is sent. */
  content?: EmailContentFieldsDto;
  sampleSetId?: string | null;
}) {
  const t = useTranslations("adminCms.common.sendTest");
  const me = useAuthStore((state) => state.user?.email ?? "");
  const [recipients, setRecipients] = useState(me);
  const [locale, setLocale] = useState(initialLocale);
  const [sampleSet, setSampleSet] = useState<string | null>(sampleSetId ?? null);
  const detail = useAdminEmailTemplate(open ? templateKey : undefined);
  const send = useSendTestEmail();

  const addresses = parseRecipients(recipients);
  const invalid = addresses.filter((address) => !isEmailAddress(address));
  const tooMany = addresses.length > MAX_RECIPIENTS;
  const variant = detail.data?.variants.find((candidate) => candidate.locale === locale);
  const fields: EmailContentFieldsDto | undefined = content ?? variant?.draft ?? detail.data?.default;
  const sets = detail.data?.sampleSets ?? [];
  const canSend = Boolean(fields) && addresses.length > 0 && invalid.length === 0 && !tooMany && !send.isPending;

  const submit = async () => {
    if (!fields) return;
    try {
      const result = await send.mutateAsync({
        key: templateKey,
        request: {
          locale,
          subject: fields.subject,
          preheader: fields.preheader,
          heading: fields.heading,
          bodyHtml: fields.bodyHtml,
          textBody: fields.textBody,
          layoutId: fields.layoutId,
          recipients: addresses,
          sampleSetId: sampleSet,
          values: null,
        },
      });
      if (result.failed.length > 0) {
        toast.error(t("partial", { sent: result.sentTo.length, failed: result.failed.join(", ") }));
      } else {
        toast.success(t("sent", { count: result.sentTo.length }));
        onOpenChange(false);
      }
    } catch (caught) {
      toast.error(getErrorMessage(caught, t("failed")));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { name: templateName })}</DialogTitle>
          <DialogDescription>{content ? t("descriptionDraft") : t("descriptionSaved")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="test-recipients" className="text-[12px] text-ink-muted">
              {t("recipients")}
            </Label>
            <Textarea
              id="test-recipients"
              className="mt-1.5 min-h-[72px] font-mono text-[12.5px]"
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
              placeholder="name@company.com, teammate@company.com"
            />
            <p className="mt-1 text-[11.5px] text-ink-subtle">
              {invalid.length > 0
                ? t("invalid", { addresses: invalid.join(", ") })
                : tooMany
                  ? t("tooMany", { max: MAX_RECIPIENTS })
                  : t("recipientsHint", { max: MAX_RECIPIENTS })}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {!content ? (
              <label className="text-[12px] text-ink-muted">
                {t("locale")}
                <select
                  value={locale}
                  onChange={(event) => setLocale(event.target.value)}
                  className="mt-1.5 block h-8 w-full rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink"
                >
                  {EMAIL_LOCALES.map((code) => (
                    <option key={code} value={code}>
                      {code.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-[12px] text-ink-muted">
              {t("sampleData")}
              <select
                value={sampleSet ?? ""}
                onChange={(event) => setSampleSet(event.target.value || null)}
                className="mt-1.5 block h-8 w-full rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink"
              >
                <option value="">{t("builtInSamples")}</option>
                {sets
                  .filter((set) => !set.builtIn)
                  .map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!canSend}>
            <PaperPlaneTilt size={14} />
            {send.isPending ? t("sending") : t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
