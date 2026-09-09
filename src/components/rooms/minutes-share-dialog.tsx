"use client";

/**
 * Who may open this biên bản.
 *
 * WHY THE TWO MODES ARE NOT A NEUTRAL PAIR OF RADIO BUTTONS
 *   "Restricted" and "Anyone with the link" are not two equivalent settings. One of them cannot be
 *   taken back: revoking stops future reads, but not the copy somebody already downloaded, and not
 *   the URL already forwarded. So the public option carries that sentence next to it, in the
 *   moment it is chosen — not in a help page, and not as a toast afterwards.
 *
 * WHY THE PERSON DOING IT IS TOLD IT IS THEIRS TO DECIDE
 *   The product cannot know whether these minutes are a client's board resolution or a standup
 *   note. It can only make sure the person choosing knows exactly what the choice does. That is
 *   the whole design brief for this dialog.
 *
 * WHAT A LINK NEVER CARRIES
 *   The document, and nothing else: no transcript, no recording, no other minutes. Said on screen
 *   because "share" in most products means rather more than that, and a host is entitled to know
 *   what they are handing over.
 */

import { useState } from "react";
import {
  Check,
  Copy,
  Globe,
  Lock,
  Trash,
  UserPlus,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useMinutesShare, useMinutesShareActions } from "@/hooks/use-minutes-share";
import type { MinutesShareMode } from "@/types/minutesShare";

export function MinutesShareDialog({
  roomId,
  open,
  onOpenChange,
}: {
  roomId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: share, isLoading } = useMinutesShare(roomId, open);
  const { setMode, setAllowDownload, revoke, addPerson, removePerson } =
    useMinutesShareActions(roomId);

  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const isPublic = share?.accessMode === "ANYONE_WITH_LINK";
  const revoked = Boolean(share?.revokedAt);

  async function copyLink() {
    if (!share?.url) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused outright — over plain HTTP, or by permission. The link is
      // in a field the person can select by hand, so this is a note, not a failure.
      toast.message("Copy the address from the field above.");
    }
  }

  function choose(mode: MinutesShareMode) {
    if (mode === share?.accessMode && !revoked) return;
    setMode.mutate(mode, {
      onError: () => toast.error("Could not change who can open this."),
    });
  }

  function submitPerson(event: React.FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;

    addPerson.mutate(value, {
      onSuccess: () => setEmail(""),
      onError: () => toast.error("Could not add that address."),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Share these minutes</DialogTitle>
          <DialogDescription className="text-[12px]">
            A link opens this document — the minutes and nothing else. It carries no access to the
            transcript, the recording or the meeting itself.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !share ? (
          <p className="py-6 text-center text-[12px] text-ink-subtle">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <ModeOption
                selected={!isPublic && !revoked}
                icon={<Lock size={15} />}
                title="Only people you add"
                detail="They sign in, and the address alone is not enough."
                onSelect={() => choose("INVITED_ONLY")}
              />
              <ModeOption
                selected={isPublic && !revoked}
                icon={<Globe size={15} />}
                title="Anyone with the link"
                detail="No account needed. Anyone who is sent the address can read and keep the document."
                onSelect={() => choose("ANYONE_WITH_LINK")}
              />
            </div>

            {isPublic && !revoked ? (
              <p className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                <Warning size={14} className="mt-px shrink-0" />
                <span>
                  This document is public to anyone holding the address. Revoking stops future
                  reads, but not a copy somebody already took — sharing it is your call to make.
                </span>
              </p>
            ) : null}

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={revoked ? "Link revoked" : share.url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="h-8 text-[12px]"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyLink}
                  disabled={revoked}
                  className="h-8 shrink-0 rounded-md text-[11px] shadow-none"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              {revoked ? (
                <p className="text-[11px] text-ink-subtle">
                  The address that was sent no longer opens anything. Choosing a mode above issues a
                  new one — the old address stays dead.
                </p>
              ) : null}
            </div>

            <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span className="text-[12px]">
                Let readers download the file
                <span className="block text-[11px] text-ink-subtle">
                  Off removes the button. It does not stop somebody copying what they can read.
                </span>
              </span>
              <Switch
                checked={share.allowDownload}
                onCheckedChange={(checked) => setAllowDownload.mutate(checked)}
              />
            </label>

            <div className="space-y-2">
              <form onSubmit={submitPerson} className="flex items-center gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  className="h-8 text-[12px]"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  disabled={addPerson.isPending || !email.trim()}
                  className="h-8 shrink-0 rounded-md text-[11px] shadow-none"
                >
                  <UserPlus size={13} />
                  Add
                </Button>
              </form>

              {share.people.length === 0 ? (
                <p className="text-[11px] text-ink-subtle">
                  Nobody has been added yet. The people who were at the meeting can already read
                  this document.
                </p>
              ) : (
                <ul className="space-y-1">
                  {share.people.map((person) => (
                    <li
                      key={person.email}
                      className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-[12px]"
                    >
                      <span className="truncate">{person.email}</span>
                      <button
                        type="button"
                        onClick={() => removePerson.mutate(person.email)}
                        className="shrink-0 text-ink-subtle transition-colors hover:text-red-500"
                        aria-label={`Remove ${person.email}`}
                      >
                        <Trash size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {!revoked ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  revoke.mutate(undefined, {
                    onError: () => toast.error("Could not revoke the link."),
                  })
                }
                className="h-8 rounded-md text-[11px] text-red-500 shadow-none hover:text-red-600"
              >
                Revoke the link
              </Button>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({
  selected,
  icon,
  title,
  detail,
  onSelect,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
        selected ? "border-ink bg-surface-2" : "border-border hover:bg-surface-2",
      )}
    >
      <span className="mt-0.5 text-ink-subtle">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[12px] font-medium">{title}</span>
        <span className="block text-[11px] leading-relaxed text-ink-subtle">{detail}</span>
      </span>
    </button>
  );
}
