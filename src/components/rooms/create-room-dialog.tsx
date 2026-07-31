"use client";

import {
  ArrowsInSimple,
  ArrowsOutSimple,
  CheckCircle,
  Copy,
  SignIn,
  SlidersHorizontal,
} from "@phosphor-icons/react/dist/ssr";
import gsap from "gsap";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateTranslationRoom,
  useTranslationRoom,
  useTranslationRoomInvitations,
  useUpdateTranslationRoomSettings,
} from "@/hooks/use-translationRooms";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { InvitePeoplePicker } from "./create/invite-people-picker";
import { LanguageSelector } from "./create/language-selector";
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
  const [isDaily, setIsDaily] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [meetingTemplate, setMeetingTemplate] = useState("Event");
  const [initializedEditRoomId, setInitializedEditRoomId] = useState<
    string | null
  >(null);
  const [initializedInvitationsRoomId, setInitializedInvitationsRoomId] =
    useState<string | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const createRoomMutation = useCreateTranslationRoom();
  const updateRoomMutation = useUpdateTranslationRoomSettings();

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

  const completionRef = useRef<HTMLDivElement | null>(null);

  const participantCount = 100; // default for UI
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
        setScheduledAt(null);
        setIsExpanded(false);
        setCreatedRoomId(null);
        setCreatedRoomCode(null);
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

  async function handleSubmit() {
    if (!canSubmit) {
      toast.error("Please complete all required fields.");
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
            maxParticipants: participantCount,
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
          toast.error("Please select a workspace before creating a room.");
          return;
        }
        const room = await createRoomMutation.mutateAsync({
          workspaceId: activeWorkspaceId,
          title: title.trim(),
          description: description.trim() || undefined,
          translationRoomType: scheduledAt ? "scheduled" : "instant",
          maxParticipants: participantCount,
          sourceLanguage: sourceLanguage,
          targetLanguages: targetLanguages,
          scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
          invitedEmails: invitedEmails.length > 0 ? invitedEmails : undefined,
        });
        setCreatedRoomId(room.id);
        setCreatedRoomCode(room.translationRoomCode);
        toast.success("Room created successfully. Invites sent!");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${editRoomId ? "update" : "create"} room.`,
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
                />
                {scheduledAt && (
                  <StartTimePicker
                    scheduledAt={scheduledAt}
                    onChange={setScheduledAt}
                    onRemove={() => setScheduledAt(null)}
                  />
                )}
                <OptionsMenu
                  hasScheduledAt={!!scheduledAt}
                  onAddScheduledAt={() => setScheduledAt(getDefaultStartTime())}
                  isDaily={isDaily}
                  onToggleDaily={() => setIsDaily(!isDaily)}
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-5 py-3 bg-surface-1/50 shrink-0">
                <span />
                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleSubmit}
                    disabled={
                      !canSubmit ||
                      createRoomMutation.isPending ||
                      updateRoomMutation.isPending
                    }
                    className="h-[30px] px-3.5 rounded-md bg-ink text-canvas hover:opacity-90 disabled:opacity-40 transition-all font-medium text-[13px] shadow-sm"
                  >
                    {createRoomMutation.isPending ||
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
