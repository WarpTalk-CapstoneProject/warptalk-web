"use client";

/**
 * Composing a platform announcement.
 *
 * Two steps, and the second one is the point. The first is an ordinary form; the second states in
 * plain words who is about to be written to and that nothing can take it back, because by the time
 * the request returns the delivery events are already on the stream. A single Send button beside a
 * form is the shape this deliberately is not.
 *
 * The audience is always a named list. `CreateAdminNotificationValidator` refuses BROADCAST and
 * SEGMENT — "Only SPECIFIC_USERS is supported until a production user/segment resolver is
 * configured" — so there is no "everyone" control to hunt for, and the composer says why rather
 * than leaving the reader to conclude one is missing.
 */

import { useMemo, useState } from "react";
import { MagnifyingGlass, PaperPlaneTilt, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";

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
import { Textarea } from "@/components/ui/textarea";
import { useAdminUserDirectory } from "@/hooks/use-admin-users";
import { getErrorMessage } from "@/lib/api/errors";
import {
  ANNOUNCEMENT_TYPES,
  buildCreateRequest,
  emptyAnnouncementDraft,
  typeAllowsPayloadFields,
  typeRequiresDowntime,
  validateAnnouncementDraft,
  type AnnouncementDraft,
  type AnnouncementType,
  type CreateAdminAnnouncementRequest,
} from "@/lib/notifications/announcement-draft";
import { cn } from "@/lib/utils";
import type { AdminUserSummaryDto } from "@/types/admin-user";

const TYPE_LABELS: Record<AnnouncementType, { label: string; hint: string }> = {
  ANNOUNCEMENT: { label: "Announcement", hint: "General news from the platform." },
  PROMOTION: { label: "Promotion", hint: "Carries an offer, a link and a discount code." },
  MAINTENANCE: { label: "Maintenance", hint: "States a downtime window. Both ends required." },
  SYSTEM: { label: "System", hint: "The platform speaking about itself. No links, no offers." },
};

export function AnnouncementComposer({
  open,
  onOpenChange,
  onSend,
  isSending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (request: CreateAdminAnnouncementRequest) => Promise<unknown>;
  isSending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-2xl">
        {/* Mounted with the dialog so a cancelled draft is gone rather than waiting to be sent
            by accident the next time the composer is opened. */}
        {open ? (
          <ComposerForm
            onCancel={() => onOpenChange(false)}
            onSend={onSend}
            onSent={() => onOpenChange(false)}
            isSending={isSending}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ComposerForm({
  onCancel,
  onSend,
  onSent,
  isSending,
}: {
  onCancel: () => void;
  onSend: (request: CreateAdminAnnouncementRequest) => Promise<unknown>;
  onSent: () => void;
  isSending: boolean;
}) {
  const [draft, setDraft] = useState<AnnouncementDraft>(() => emptyAnnouncementDraft());
  const [recipients, setRecipients] = useState<AdminUserSummaryDto[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof AnnouncementDraft>(key: K, value: AnnouncementDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // The picker holds the whole user so the confirmation can name people rather than ids; the
  // request only ever carries the ids.
  const withRecipients = useMemo(
    () => ({ ...draft, recipientIds: recipients.map((user) => user.id) }),
    [draft, recipients],
  );

  const handleReview = () => {
    const invalid = validateAnnouncementDraft(withRecipients);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setIsConfirming(true);
  };

  const handleSend = async () => {
    // Re-checked at the moment of sending, not only when Review was pressed. The two are separated
    // by a screen the reader can sit on, and nothing else guarantees the draft is still valid.
    const invalid = validateAnnouncementDraft(withRecipients);
    if (invalid) {
      setError(invalid);
      setIsConfirming(false);
      return;
    }

    try {
      setError(null);
      await onSend(buildCreateRequest(withRecipients));
      onSent();
    } catch (err) {
      setError(getErrorMessage(err, "The announcement could not be sent."));
      setIsConfirming(false);
    }
  };

  if (isConfirming) {
    return (
      <ConfirmStep
        draft={withRecipients}
        recipients={recipients}
        error={error}
        isSending={isSending}
        onBack={() => setIsConfirming(false)}
        onSend={() => void handleSend()}
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Compose an announcement</DialogTitle>
        <DialogDescription>
          Delivered to the people you name, once. There is no draft, no schedule and no recall.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-5">
        <div>
          <Label className="text-[12px] text-ink-muted">Type</Label>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {ANNOUNCEMENT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => set("type", type)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  draft.type === type
                    ? "border-ink bg-ink text-surface-1"
                    : "border-hairline/60 hover:bg-surface-2",
                )}
              >
                <span className="block text-[13px] font-medium">{TYPE_LABELS[type].label}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-[11px]",
                    draft.type === type ? "text-surface-1/70" : "text-ink-subtle",
                  )}
                >
                  {TYPE_LABELS[type].hint}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="announcement-title" className="text-[12px] text-ink-muted">
            Title
          </Label>
          <Input
            id="announcement-title"
            className="mt-1.5"
            maxLength={255}
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="announcement-content" className="text-[12px] text-ink-muted">
            Message
          </Label>
          <Textarea
            id="announcement-content"
            className="mt-1.5"
            rows={5}
            value={draft.content}
            onChange={(event) => set("content", event.target.value)}
          />
          <p className="mt-1 text-[11px] text-ink-subtle">
            Plain text. The notification service refuses anything that looks like an HTML tag.
          </p>
        </div>

        {typeAllowsPayloadFields(draft.type) ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="announcement-cta" className="text-[12px] text-ink-muted">
                Call-to-action link <span className="text-ink-subtle">(optional)</span>
              </Label>
              <Input
                id="announcement-cta"
                className="mt-1.5"
                placeholder="https://…"
                value={draft.ctaLink}
                onChange={(event) => set("ctaLink", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="announcement-image" className="text-[12px] text-ink-muted">
                Image URL <span className="text-ink-subtle">(optional)</span>
              </Label>
              <Input
                id="announcement-image"
                className="mt-1.5"
                placeholder="https://…"
                value={draft.imageUrl}
                onChange={(event) => set("imageUrl", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="announcement-discount" className="text-[12px] text-ink-muted">
                Discount code <span className="text-ink-subtle">(optional)</span>
              </Label>
              <Input
                id="announcement-discount"
                className="mt-1.5"
                value={draft.discountCode}
                onChange={(event) => set("discountCode", event.target.value)}
              />
            </div>
          </div>
        ) : (
          // Said, not merely hidden. A reader who used these on the last notice needs to know they
          // are gone on purpose rather than wonder where the fields went.
          <p className="rounded-lg border border-hairline/60 bg-surface-2 px-3 py-2 text-[12px] text-ink-muted">
            A system notice carries no link, image or discount code. The service refuses them on
            this type.
          </p>
        )}

        {typeRequiresDowntime(draft.type) ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="announcement-downtime-start" className="text-[12px] text-ink-muted">
                Downtime starts
              </Label>
              <Input
                id="announcement-downtime-start"
                className="mt-1.5"
                type="datetime-local"
                value={draft.downtimeStart}
                onChange={(event) => set("downtimeStart", event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="announcement-downtime-end" className="text-[12px] text-ink-muted">
                Downtime ends
              </Label>
              <Input
                id="announcement-downtime-end"
                className="mt-1.5"
                type="datetime-local"
                value={draft.downtimeEnd}
                onChange={(event) => set("downtimeEnd", event.target.value)}
              />
            </div>
            <p className="text-[11px] text-ink-subtle sm:col-span-2">
              Entered in your own time zone and sent as an absolute instant.
            </p>
          </div>
        ) : null}

        <RecipientPicker
          selected={recipients}
          onToggle={(user) =>
            setRecipients((current) =>
              current.some((candidate) => candidate.id === user.id)
                ? current.filter((candidate) => candidate.id !== user.id)
                : [...current, user],
            )
          }
          onClear={() => setRecipients([])}
        />

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel} disabled={isSending}>
          Cancel
        </Button>
        <Button onClick={handleReview} disabled={isSending}>
          Review before sending
        </Button>
      </DialogFooter>
    </>
  );
}

function RecipientPicker({
  selected,
  onToggle,
  onClear,
}: {
  selected: AdminUserSummaryDto[];
  onToggle: (user: AdminUserSummaryDto) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState("");

  /**
   * A search, not a browse.
   *
   * The list only appears once something has been typed. Rendering the first twenty accounts on
   * open would invite selecting people because they were on screen — which on a directory sorted
   * by signup date means whoever joined most recently.
   */
  const query = useMemo(
    () => ({ page: 1, pageSize: 10, search: search.trim(), status: "active" as const }),
    [search],
  );
  const directory = useAdminUserDirectory(query);
  const results = search.trim() ? (directory.data?.items ?? []) : [];
  const selectedIds = new Set(selected.map((user) => user.id));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor="announcement-recipients" className="text-[12px] text-ink-muted">
          Recipients
        </Label>
        <span className="text-[11px] text-ink-subtle">
          {selected.length === 0
            ? "Nobody selected"
            : `${selected.length} selected`}
        </span>
      </div>

      <div className="relative mt-1.5">
        <MagnifyingGlass
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
        />
        <Input
          id="announcement-recipients"
          className="pl-8"
          placeholder="Search the platform directory by name or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {search.trim() ? (
        <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-hairline/60">
          {directory.isPending ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">Searching…</p>
          ) : directory.isError ? (
            <p className="px-3 py-3 text-[12px] text-destructive">
              The user directory could not be read.
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-ink-muted">No account matches that.</p>
          ) : (
            <ul>
              {results.map((user) => {
                const isSelected = selectedIds.has(user.id);
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(user)}
                      className="flex w-full items-center justify-between gap-3 border-b border-hairline/60 px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-ink">{user.fullName}</span>
                        <span className="block truncate text-[11px] text-ink-subtle">
                          {user.email}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-[11px] font-medium",
                          isSelected ? "text-ink" : "text-ink-subtle",
                        )}
                      >
                        {isSelected ? "Selected" : "Add"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {selected.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {selected.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1 rounded-full border border-hairline/60 bg-surface-2 py-0.5 pl-2.5 pr-1 text-[11px] text-ink"
            >
              {user.email}
              <button
                type="button"
                aria-label={`Remove ${user.email}`}
                onClick={() => onToggle(user)}
                className="grid size-4 place-items-center rounded-full text-ink-subtle hover:bg-surface-1 hover:text-ink"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={onClear} className="h-6 px-2 text-[11px]">
            Clear
          </Button>
        </div>
      ) : null}

      <p className="mt-1.5 text-[11px] text-ink-subtle">
        A named list only. The service accepts no &ldquo;everyone&rdquo; audience until a segment
        resolver exists.
      </p>
    </div>
  );
}

function ConfirmStep({
  draft,
  recipients,
  error,
  isSending,
  onBack,
  onSend,
}: {
  draft: AnnouncementDraft;
  recipients: AdminUserSummaryDto[];
  error: string | null;
  isSending: boolean;
  onBack: () => void;
  onSend: () => void;
}) {
  // Named in full up to a point, then counted. Ten addresses can be read; two hundred cannot, and
  // a wall of them would be scrolled past rather than checked.
  const NAMED = 10;
  const named = recipients.slice(0, NAMED);
  const remaining = recipients.length - named.length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Send this announcement?</DialogTitle>
        <DialogDescription>
          It reaches everyone below as soon as you confirm. It cannot be edited, recalled or
          deleted afterwards.
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-4">
        <div className="rounded-lg border border-hairline/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-subtle">
            {TYPE_LABELS[draft.type].label}
          </p>
          <p className="mt-1 text-[14px] font-medium text-ink">{draft.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink-muted">{draft.content}</p>
        </div>

        <div className="rounded-lg border border-hairline/60 p-3">
          <p className="text-[12px] font-medium text-ink">
            {recipients.length} {recipients.length === 1 ? "recipient" : "recipients"}
          </p>
          <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">
            {named.map((user) => user.email).join(", ")}
            {remaining > 0 ? ` and ${remaining} more` : ""}
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
          >
            <WarningCircle size={14} weight="duotone" className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onBack} disabled={isSending}>
          Back
        </Button>
        <Button onClick={onSend} disabled={isSending}>
          <PaperPlaneTilt size={14} weight="fill" />
          {isSending ? "Sending…" : `Send to ${recipients.length}`}
        </Button>
      </DialogFooter>
    </>
  );
}
