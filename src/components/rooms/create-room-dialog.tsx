"use client";

import {
  ArrowsInSimple,
  ArrowsOutSimple,
  CheckCircle,
  Copy,
  Repeat,
  SignIn,
  SlidersHorizontal,
} from "@phosphor-icons/react/dist/ssr";
import gsap from "gsap";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { meetingTypeByLabel, meetingTypeHighlights } from "@/lib/meeting-types";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateRecurringTranslationRoom,
  useCreateTranslationRoom,
  useTranslationRoom,
  useTranslationRoomInvitations,
  useUpdateTranslationRoomSettings,
} from "@/hooks/use-translationRooms";
import { useWorkspaceSettings } from "@/hooks/use-workspace";
import { getErrorMessage } from "@/lib/errors";
import {
  normalizeLanguagePolicy,
  reconcileMeetingLanguages,
} from "@/lib/languages";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  type DailyRecurrenceDraft,
  describeDailySchedule,
  detectTimeZone,
} from "@/lib/daily-recurrence";
import { DailyScheduleDialog } from "./create/daily-schedule-dialog";
import { InvitePeoplePicker } from "./create/invite-people-picker";
import { LanguageSelector } from "./create/language-selector";
import { PillButton } from "./create/pill-button";
import { OptionsMenu } from "./create/options-menu";
import { StartTimePicker } from "./create/start-time-picker";
import { TemplatePicker } from "./create/template-picker";

function getDefaultStartTime() {
  const parsed = new Date();
  parsed.setMinutes(0, 0, 0);
  parsed.setHours(parsed.getHours() + 1);
  return parsed;
}

export function CreateRoomDialog() {
  const isOpen = useUIStore((state) => state.createRoomModalOpen);
  const setIsOpen = useUIStore((state) => state.setCreateRoomModalOpen);
  const editRoomId = useUIStore((state) => state.editRoomId);
  const setEditRoomId = useUIStore((state) => state.setEditRoomId);
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId,
  );
  const workspaceName =
    useWorkspaceStore((state) => state.activeWorkspaceName) || "Workspace";
  const activeWorkspaceSlug = useWorkspaceStore(
    (state) => state.activeWorkspaceSlug,
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  // The set of languages that will be spoken in this meeting. There is no source→target
  // direction: each participant's own speak/listen language comes from their profile at
  // join. Defaults to a common bilingual pair.
  const [meetingLanguages, setMeetingLanguages] = useState<string[]>([
    "en-US",
    "vi-VN",
  ]);
  // WT-327: the Daily rule actually in force, or null when this is a one-off meeting. This
  // replaces the old boolean `isDaily`, which was declared, rendered as a check mark, and then
  // never read by handleSubmit — the switch was dead, and a boolean could not have carried the
  // hour anyway.
  const [dailyRecurrence, setDailyRecurrence] = useState<DailyRecurrenceDraft | null>(null);
  const [dailyDialogOpen, setDailyDialogOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [meetingTemplate, setMeetingTemplate] = useState("Event");
  const [initializedEditRoomId, setInitializedEditRoomId] = useState<
    string | null
  >(null);
  const [initializedInvitationsRoomId, setInitializedInvitationsRoomId] =
    useState<string | null>(null);
  // Which workspace language policy the picked set has already been trimmed to (WT-271).
  const [appliedLanguagePolicyKey, setAppliedLanguagePolicyKey] = useState<
    string | null
  >(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  // WT-270: the server's own explanation for a refused submit, kept on screen. A toast alone
  // was not enough — it expires, and the dialog it refers to stays open behind it.
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createRoomMutation = useCreateTranslationRoom();
  const createRecurringRoomMutation = useCreateRecurringTranslationRoom();
  const updateRoomMutation = useUpdateTranslationRoomSettings();

  // WT-271: the workspace's language policy, so the picker offers only what the server will
  // accept. `allowedTargetLanguages` is a list of bare ISO-639-1 codes; empty means
  // unrestricted, matching the server's own whitelist check.
  const { data: workspaceSettings } = useWorkspaceSettings(activeWorkspaceId || "");
  const allowedTargetLanguages = workspaceSettings?.allowedTargetLanguages;

  const { data: editRoomData } = useTranslationRoom(editRoomId || "");
  const { data: editInvitations } = useTranslationRoomInvitations(
    editRoomId || "",
  );

  if (editRoomId && editRoomData && initializedEditRoomId !== editRoomId) {
    setInitializedEditRoomId(editRoomId);
    setTitle(editRoomData.title);
    setDescription(editRoomData.description || "");
    // Reconstruct the meeting-language set from persisted room fields (target set,
    // falling back to the legacy source language for older rooms).
    setMeetingLanguages(
      editRoomData.targetLanguages?.length
        ? editRoomData.targetLanguages
        : [editRoomData.sourceLanguage || "en-US"],
    );
    setScheduledAt(
      editRoomData.scheduledAt ? new Date(editRoomData.scheduledAt) : null,
    );
  }

  if (
    editRoomId &&
    editInvitations &&
    initializedInvitationsRoomId !== editRoomId
  ) {
    setInitializedInvitationsRoomId(editRoomId);
    setInvitedEmails(editInvitations.map((invitation) => invitation.email));
  }

  // WT-271: the defaults above are a fixed en/vi pair, so a workspace whose policy excludes
  // either one opens the dialog already holding a language the server will refuse. Trim the
  // selection to the policy as soon as the policy is known, rather than letting the 403 be
  // the first the host hears of it. Derived during render — the same shape as the edit-room
  // initialization above — because doing it in an effect costs an extra render pass with the
  // forbidden default briefly on screen. Keyed by workspace AND policy so that switching
  // workspace, or an admin tightening the policy mid-session, re-applies it.
  const languagePolicyKey =
    !editRoomId && activeWorkspaceId && workspaceSettings
      ? `${activeWorkspaceId}:${normalizeLanguagePolicy(allowedTargetLanguages).join(",")}`
      : null;

  if (languagePolicyKey && appliedLanguagePolicyKey !== languagePolicyKey) {
    setAppliedLanguagePolicyKey(languagePolicyKey);
    const reconciled = reconcileMeetingLanguages(
      meetingLanguages,
      allowedTargetLanguages,
    );
    const unchanged =
      reconciled.length === meetingLanguages.length &&
      reconciled.every((language, index) => language === meetingLanguages[index]);
    if (!unchanged) setMeetingLanguages(reconciled);
  }

  const completionRef = useRef<HTMLDivElement | null>(null);

  // Deliberately not sent any more: the meeting type decides the seat count server-side
  // (a Virtual Appointment is 1:1, a Live Event is not), and a hardcoded 100 here would
  // override every one of those.
  const validation = {
    title: title.trim().length > 0,
    languages: meetingLanguages.length > 0,
  };
  const canSubmit = Object.values(validation).every(Boolean);
  const inviteLink =
    typeof window === "undefined" || !createdRoomCode
      ? ""
      : `${window.location.origin}/join?code=${createdRoomCode}`;

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (open && resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    if (!open) {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(() => {
        setTitle("");
        setDescription("");
        setInvitedEmails([]);
        setMeetingLanguages(["en-US", "vi-VN"]);
        // The reset puts the fixed default pair back, so the policy has to be re-applied to
        // it on the next open — otherwise a forbidden default returns unchecked.
        setAppliedLanguagePolicyKey(null);
        setScheduledAt(null);
        // WT-327: reset with everything else. The old `isDaily` was left out of this block, so
        // its check mark survived into the next dialog the user opened.
        setDailyRecurrence(null);
        setDailyDialogOpen(false);
        setIsExpanded(false);
        setCreatedRoomId(null);
        setCreatedRoomCode(null);
        setSubmitError(null);
        setInitializedEditRoomId(null);
        setInitializedInvitationsRoomId(null);
        setEditRoomId(null);
      }, 400);
    }
  }

  useEffect(
    () => () => {
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!createdRoomId) return;
    if (completionRef.current) {
      gsap.fromTo(
        completionRef.current,
        { autoAlpha: 0, y: 16, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out" },
      );
    }
  }, [createdRoomId]);

  function failSubmit(message: string) {
    setSubmitError(message);
    toast.error(message);
  }

  async function handleSubmit() {
    setSubmitError(null);
    if (!canSubmit) {
      failSubmit("Please complete all required fields.");
      return;
    }
    try {
      // The meeting is defined by its set of languages. The backend still models a
      // (sourceLanguage, targetLanguages) pair, so derive them: source is just the first
      // declared language (an internal fallback for the audio-route mesh), and the full
      // declared set is sent as targetLanguages.
      const languages = Array.from(new Set(meetingLanguages));
      const sourceLanguage = languages[0];
      const targetLanguages = languages;

      if (editRoomId) {
        await updateRoomMutation.mutateAsync({
          id: editRoomId,
          data: {
            title: title.trim(),
            description: description.trim() || undefined,
            sourceLanguage: sourceLanguage,
            targetLanguages: targetLanguages,
            scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
            invitedEmails: invitedEmails.length > 0 ? invitedEmails : undefined,
          },
        });
        toast.success("Room updated successfully.");
        handleOpenChange(false);
      } else {
        if (!activeWorkspaceId) {
          failSubmit("Please select a workspace before creating a room.");
          return;
        }
        // Everything both paths send. `workspaceId` is deliberately NOT hoisted in here: it is
        // spelled out at each mutateAsync below so the workspace-scoping contract
        // (scripts/check-create-room-language-contract.mjs) still reads it where it is sent,
        // rather than trusting a spread to carry it.
        const common = {
          title: title.trim(),
          description: description.trim() || undefined,
          // The picked type is what the room actually becomes now — it decides the lobby,
          // mute-on-entry, auto-record, breakouts and seat count server-side. It used to be
          // discarded here in favour of instant/scheduled, which is why every type behaved
          // identically.
          translationRoomType: meetingTypeByLabel(meetingTemplate).value,
          sourceLanguage: sourceLanguage,
          targetLanguages: targetLanguages,
          invitedEmails: invitedEmails.length > 0 ? invitedEmails : undefined,
        };

        if (dailyRecurrence) {
          // WT-327: THIS is the line the Daily switch never had. The rule owns every
          // occurrence's time, so `scheduledAt` is deliberately not sent alongside it — the
          // server refuses a request carrying both rather than silently discarding one, which
          // is the failure mode this whole change exists to remove.
          const result = await createRecurringRoomMutation.mutateAsync({
            ...common,
            workspaceId: activeWorkspaceId,
            recurrence: {
              type: "DAILY",
              startTimeLocal: dailyRecurrence.time,
              // The browser's zone, not a hardcoded one: "8am" means 8am where the host is.
              timeZone: detectTimeZone(),
              endDateLocal: dailyRecurrence.endDate,
            },
          });
          setCreatedRoomId(result.firstOccurrence.id);
          setCreatedRoomCode(result.firstOccurrence.translationRoomCode);
          toast.success(
            `Daily meeting scheduled at ${dailyRecurrence.time} — ${result.totalOccurrenceCount} meetings.`,
          );
          return;
        }

        const room = await createRoomMutation.mutateAsync({
          ...common,
          workspaceId: activeWorkspaceId,
          scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
        });
        setCreatedRoomId(room.id);
        setCreatedRoomCode(room.translationRoomCode);
        toast.success("Room created successfully. Invites sent!");
      }
    } catch (error) {
      // WT-270: the server explains itself — "Target language 'ko' is not allowed by the
      // workspace policy.", "Workspace active room limit (5) has been reached." — and this
      // used to throw all of it away in favour of the AxiosError's own `message`, which is
      // never more than "Request failed with status code 403". `getErrorMessage` reads the
      // response body first. Both the create and the edit path land here, so both are fixed.
      failSubmit(
        getErrorMessage(
          error,
          `Failed to ${editRoomId ? "update" : "create"} room.`,
        ),
      );
    }
  }

  async function copyInviteLink() {
    await navigator.clipboard?.writeText(inviteLink);
    toast.success("Invite link copied.");
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName="!bg-black/40 !backdrop-blur-none"
        className={cn(
          "max-w-[calc(100vw-2rem)] w-full p-0 border-border/60 bg-white dark:bg-zinc-950 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden [transition-property:height,top,bottom,max-height,transform] duration-300",
          createdRoomId
            ? "sm:max-w-[500px] !top-[25%] !-translate-y-[25%]"
            : "sm:max-w-[750px] top-[12vh] !translate-y-0",
          !createdRoomId &&
            isExpanded &&
            "top-[5vh] bottom-[5vh] sm:h-[90vh] flex flex-col",
        )}
      >
        <DialogTitle className="sr-only">
          {editRoomId ? "Edit meeting" : "Create new meeting"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Configure and create a new translation room
        </DialogDescription>

        <div className="flex flex-col w-full relative h-full">
          {!createdRoomId ? (
            <div className="flex flex-col w-full h-full">
              {/* Context Header */}
              <div className="px-5 pt-3 pb-1 flex items-center justify-between">
                <div className="flex items-center text-[12px] font-medium text-ink-muted/80 gap-1.5">
                  <span className="flex items-center gap-1.5 bg-surface-2 px-1.5 py-0.5 rounded text-ink/80">
                    {workspaceName}
                  </span>
                  <span>›</span>
                  <TemplatePicker
                    value={meetingTemplate}
                    onChange={setMeetingTemplate}
                  />
                  {/* The type is no longer cosmetic — say out loud what it will configure,
                      rather than letting the host discover it after the room exists. */}
                  {!editRoomId &&
                    meetingTypeHighlights(meetingTemplate).map((highlight) => (
                      <span
                        key={highlight}
                        className="hidden sm:inline rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-muted"
                      >
                        {highlight}
                      </span>
                    ))}
                </div>

                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors mr-6"
                  title={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? (
                    <ArrowsInSimple weight="bold" size={14} />
                  ) : (
                    <ArrowsOutSimple weight="bold" size={14} />
                  )}
                </button>
              </div>

              {/* Header / Title Input */}
              <div
                className={cn(
                  "px-5 pt-3 pb-2 flex flex-col gap-2 flex-1",
                  isExpanded && "overflow-y-auto",
                )}
              >
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Meeting title"
                  className="w-full bg-transparent text-[18px] font-medium text-ink placeholder:text-ink-muted/50 outline-none border-none focus:ring-0 p-0 shrink-0"
                  autoFocus
                />

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add description..."
                  className={cn(
                    "w-full bg-transparent text-[14px] text-ink placeholder:text-ink-muted/60 outline-none border-none focus:ring-0 p-0 resize-none transition-all",
                    isExpanded ? "flex-1 min-h-[300px]" : "min-h-[60px]",
                  )}
                />
              </div>

              {/* Pill Options Row */}
              <div className="px-5 pb-[5px] pt-2 flex flex-wrap items-center gap-2 mt-2 shrink-0">
                <InvitePeoplePicker
                  emails={invitedEmails}
                  onChange={setInvitedEmails}
                />
                <LanguageSelector
                  languages={meetingLanguages}
                  onLanguagesChange={setMeetingLanguages}
                  allowedTargetLanguages={allowedTargetLanguages}
                />
                {/* WT-327: a one-off time and a daily rule are mutually exclusive — the rule
                    owns every occurrence's time — so only one of the two pills is ever offered. */}
                {scheduledAt && !dailyRecurrence && (
                  <StartTimePicker
                    scheduledAt={scheduledAt}
                    onChange={setScheduledAt}
                    onRemove={() => setScheduledAt(null)}
                  />
                )}
                {dailyRecurrence && (
                  <PillButton
                    icon={Repeat}
                    active
                    onClick={() => setDailyDialogOpen(true)}
                    label={
                      <span data-testid="daily-pill">
                        Daily {dailyRecurrence.time}
                      </span>
                    }
                  />
                )}
                <OptionsMenu
                  hasScheduledAt={!!scheduledAt || !!dailyRecurrence}
                  onAddScheduledAt={() => setScheduledAt(getDefaultStartTime())}
                  isDaily={!!dailyRecurrence}
                  dailyTime={dailyRecurrence?.time}
                  onToggleDaily={() => setDailyDialogOpen(true)}
                />
              </div>

              {/* WT-327: what the host is about to create, spelled out before they press the
                  button. The control it replaces looked identical whether it worked or not. */}
              {dailyRecurrence && (
                <p
                  data-testid="daily-schedule-summary"
                  className="px-5 pb-1 text-[11px] text-ink-muted"
                >
                  {describeDailySchedule(dailyRecurrence, new Date())} ·{" "}
                  {detectTimeZone()}
                </p>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between gap-4 px-5 py-3 bg-surface-1/50 shrink-0">
                {/* WT-270: the refusal stays put next to the button that caused it, so a
                    dismissed or missed toast does not leave the host staring at a dialog
                    that simply refuses to close for no stated reason. */}
                {submitError ? (
                  <p
                    role="alert"
                    className="text-[12px] leading-snug text-destructive min-w-0"
                  >
                    {submitError}
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-4 shrink-0">
                  <Button
                    onClick={handleSubmit}
                    disabled={
                      !canSubmit ||
                      createRoomMutation.isPending ||
                      createRecurringRoomMutation.isPending ||
                      updateRoomMutation.isPending
                    }
                    className="h-[30px] px-3.5 rounded-md bg-ink text-canvas hover:opacity-90 disabled:opacity-40 transition-all font-medium text-[13px] shadow-sm"
                  >
                    {createRoomMutation.isPending ||
                    createRecurringRoomMutation.isPending ||
                    updateRoomMutation.isPending
                      ? "Saving..."
                      : editRoomId
                        ? "Save Changes"
                        : "Create Room"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div
              ref={completionRef}
              className="p-8 flex flex-col items-center text-center justify-center relative"
            >
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <CheckCircle
                  weight="bold"
                  className="text-emerald-600 h-6 w-6"
                />
              </div>

              <div className="flex flex-col items-center w-full max-w-[320px]">
                <h3 className="text-[18px] font-semibold text-foreground mb-1 tracking-tight">
                  Meeting Created Successfully
                </h3>
                <p className="text-[13px] text-muted-foreground mb-6">
                  Your room “{title}” is ready to use.
                </p>

                {/* Room Code Card */}
                <div className="w-full bg-surface-1 border border-border/60 rounded-lg p-3 mb-8 flex flex-col items-center gap-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Room Code
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[16px] font-semibold text-foreground tracking-wide">
                      {createdRoomCode}
                    </span>
                    <button
                      onClick={copyInviteLink}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-surface-2"
                      title="Copy Invite Link"
                    >
                      <Copy weight="bold" className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-3 w-full">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      handleOpenChange(false);
                      useUIStore.getState().setSetupRoomId(createdRoomId);
                      useUIStore.getState().setSetupRoomModalOpen(true);
                    }}
                    className="flex-1 text-[13px] h-[34px] font-medium gap-2"
                  >
                    <SlidersHorizontal weight="bold" size={14} />
                    Configure
                  </Button>
                  <Link
                    href={
                      activeWorkspaceSlug
                        ? `/${activeWorkspaceSlug}/rooms/${createdRoomId}`
                        : `/room/${createdRoomId}`
                    }
                    onClick={() => handleOpenChange(false)}
                    className={cn(
                      buttonVariants({ variant: "default" }),
                      "flex-1 text-[13px] h-[34px] font-medium bg-primary text-white hover:bg-primary/90 gap-2 flex items-center justify-center",
                    )}
                  >
                    <SignIn weight="bold" size={14} />
                    Join
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* WT-327: "khi chọn mode daily thì mở modal để user chọn giờ daily".
              Rendered INSIDE the create dialog's popup on purpose. base-ui only recognises a
              dialog as NESTED when its root sits within the parent popup's context; anywhere
              else — a sibling of <Dialog>, or a child of <Dialog> outside <DialogContent> —
              the parent treats the new dialog taking focus as an outside interaction and
              closes itself, throwing away the half-filled meeting the host was writing. */}
          <DailyScheduleDialog
            open={dailyDialogOpen}
            onOpenChange={setDailyDialogOpen}
            value={dailyRecurrence}
            onConfirm={(draft) => {
              setDailyRecurrence(draft);
              // A one-off time cannot coexist with a rule that decides every occurrence's time.
              setScheduledAt(null);
            }}
            onDisable={() => setDailyRecurrence(null)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
