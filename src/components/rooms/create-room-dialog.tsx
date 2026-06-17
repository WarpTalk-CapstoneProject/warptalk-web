"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { format, setHours, setMinutes } from "date-fns";
import { 
  Calendar as CalendarIcon, 
  Copy, 
  Translate, 
  GlobeHemisphereWest,
  SlidersHorizontal, 
  Users, 
  X,
  CheckCircle,
  Plus,
  Trash,
  DotsThree,
  ArrowsOutSimple,
  ArrowsInSimple,
  Link as LinkIcon,
  Paperclip,
  CaretDown,
  Monitor,
  VideoCamera,
  UsersThree,
  MicrophoneStage,
  Broadcast,
  SignIn,
  FileText
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useCreateTranslationRoom, useTranslationRoom, useTranslationRoomInvitations, useUpdateTranslationRoomSettings } from "@/hooks/use-translationRooms";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaces, useWorkspaceMembers } from "@/hooks/use-workspace";
import { OptionsMenu } from "./create/options-menu";
import { TemplatePicker } from "./create/template-picker";
import { InvitePeoplePicker } from "./create/invite-people-picker";
import { StartTimePicker } from "./create/start-time-picker";
import { LanguageSelector } from "./create/language-selector";
import { ResourcePicker } from "./create/resource-picker";

const languageOptions = [
  { code: "vi", label: "Vietnamese" },
  { code: "en", label: "English" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
];

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
  const user = useAuthStore((state) => state.user);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [sourceLanguage, setSourceLanguage] = useState<string>("en");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["vi"]);
  const [isMultiLang, setIsMultiLang] = useState(false);
  const [isDaily, setIsDaily] = useState(false);
  const [hasResources, setHasResources] = useState(false);
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [meetingTemplate, setMeetingTemplate] = useState("Event");
  
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  const handleCopyLink = () => {
    setIsLinkCopied(true);
    navigator.clipboard.writeText(window.location.href);
    setTimeout(() => setIsLinkCopied(false), 5000);
  };
  
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const createRoomMutation = useCreateTranslationRoom();
  const updateRoomMutation = useUpdateTranslationRoomSettings();
  
  const { data: editRoomData } = useTranslationRoom(editRoomId || "");
  const { data: editInvitations } = useTranslationRoomInvitations(editRoomId || "");

  useEffect(() => {
    if (editRoomId && editRoomData) {
      setTitle(editRoomData.title);
      setDescription(editRoomData.description || "");
      setSourceLanguage(editRoomData.sourceLanguage || "en");
      setSelectedLanguages(editRoomData.targetLanguages);
      setIsMultiLang(editRoomData.targetLanguages.length > 1);
      setScheduledAt(editRoomData.scheduledAt ? new Date(editRoomData.scheduledAt) : null);
    }
  }, [editRoomId, editRoomData]);

  useEffect(() => {
    if (editRoomId && editInvitations) {
      setInvitedEmails(editInvitations.map(i => i.email));
    }
  }, [editRoomId, editInvitations]);
  
  const completionRef = useRef<HTMLDivElement | null>(null);

  const participantCount = 100; // default for UI
  const validation = {
    title: title.trim().length > 0,
    languages: selectedLanguages.length > 0,
  };
  const canSubmit = Object.values(validation).every(Boolean);
  const inviteLink = typeof window === "undefined" || !createdRoomCode ? "" : `${window.location.origin}/join?code=${createdRoomCode}`;

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      setTimeout(() => {
        setTitle("");
        setDescription("");
        setInvitedEmails([]);
        setSelectedLanguages(["vi"]);
        setSourceLanguage("en");
        setIsMultiLang(false);
        setScheduledAt(null);
        setHasResources(false);
        setSelectedResources([]);
        setIsExpanded(false);
        setCreatedRoomId(null);
        setCreatedRoomCode(null);
        setEditRoomId(null);
      }, 400);
    }
  }

  useEffect(() => {
    if (!createdRoomId) return;
    if (completionRef.current) {
      gsap.fromTo(
        completionRef.current,
        { autoAlpha: 0, y: 16, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out" }
      );
    }
  }, [createdRoomId]);

  async function handleSubmit() {
    if (!canSubmit) {
      toast.error("Please complete all required fields.");
      return;
    }

    try {
      // Normalize target languages: remove duplicates and remove source language
      const normalizedTargetLanguages = Array.from(new Set(selectedLanguages))
        .filter(lang => lang !== sourceLanguage);
      
      const targetLangs = normalizedTargetLanguages.length > 0 ? normalizedTargetLanguages : [sourceLanguage === "vi" ? "en" : "vi"];

      if (editRoomId) {
        await updateRoomMutation.mutateAsync({
          id: editRoomId,
          data: {
            title: title.trim(),
            description: description.trim() || undefined,
            maxParticipants: participantCount,
            sourceLanguage: sourceLanguage,
            targetLanguages: targetLangs,
            scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
            invitedEmails: invitedEmails.length > 0 ? invitedEmails : undefined,
          }
        });
        toast.success("Room updated successfully.");
        handleOpenChange(false);
      } else {
        const room = await createRoomMutation.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          translationRoomType: scheduledAt ? "scheduled" : "instant",
          maxParticipants: participantCount,
          sourceLanguage: sourceLanguage,
          targetLanguages: targetLangs,
          scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
          invitedEmails: invitedEmails.length > 0 ? invitedEmails : undefined,
        });
        setCreatedRoomId(room.id);
        setCreatedRoomCode(room.translationRoomCode);
        toast.success("Room created successfully. Invites sent!");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${editRoomId ? "update" : "create"} room.`);
    }
  }

  async function copyInviteLink() {
    await navigator.clipboard?.writeText(inviteLink);
    toast.success("Invite link copied.");
  }

  const workspaceName = "FPT-SEP490";

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent 
        overlayClassName="!bg-black/40 !backdrop-blur-none" 
        className={cn(
          "max-w-[calc(100vw-2rem)] w-full p-0 border-border/60 bg-white dark:bg-zinc-950 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden [transition-property:height,top,bottom,max-height,transform] duration-300",
          createdRoomId 
            ? "sm:max-w-[500px] !top-[25%] !-translate-y-[25%]" 
            : "sm:max-w-[750px] top-[12vh] !translate-y-0",
          !createdRoomId && isExpanded && "top-[5vh] bottom-[5vh] sm:h-[90vh] flex flex-col"
        )}
      >
        <DialogTitle className="sr-only">{editRoomId ? "Edit meeting" : "Create new meeting"}</DialogTitle>
        <DialogDescription className="sr-only">Configure and create a new translation room</DialogDescription>
        
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
                  <TemplatePicker value={meetingTemplate} onChange={setMeetingTemplate} />
                </div>
                
                <button 
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors mr-6"
                  title={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? <ArrowsInSimple weight="bold" size={14} /> : <ArrowsOutSimple weight="bold" size={14} />}
                </button>
              </div>

              {/* Header / Title Input */}
              <div className={cn("px-5 pt-3 pb-2 flex flex-col gap-2 flex-1", isExpanded && "overflow-y-auto")}>
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
                    isExpanded ? "flex-1 min-h-[300px]" : "min-h-[60px]"
                  )}
                />
              </div>

              {/* Pill Options Row */}
              <div className="px-5 pb-[5px] pt-2 flex flex-wrap items-center gap-2 mt-2 shrink-0">
                <InvitePeoplePicker emails={invitedEmails} onChange={setInvitedEmails} />
                <LanguageSelector 
                  source={sourceLanguage}
                  onSourceChange={setSourceLanguage}
                  targets={selectedLanguages} 
                  onTargetsChange={setSelectedLanguages}
                  isMultiLang={isMultiLang}
                />
                {scheduledAt && (
                  <StartTimePicker 
                    scheduledAt={scheduledAt} 
                    onChange={setScheduledAt} 
                    onRemove={() => setScheduledAt(null)} 
                  />
                )}
                {hasResources && (
                  <ResourcePicker 
                    resources={selectedResources} 
                    onChange={setSelectedResources} 
                  />
                )}
                <OptionsMenu 
                  hasScheduledAt={!!scheduledAt} 
                  onAddScheduledAt={() => setScheduledAt(getDefaultStartTime())} 
                  isMultiLang={isMultiLang}
                  onToggleMultiLang={() => {
                    setIsMultiLang(!isMultiLang);
                    if (isMultiLang && selectedLanguages.length > 1) {
                      setSelectedLanguages([selectedLanguages[0]]);
                    }
                  }}
                  isDaily={isDaily}
                  onToggleDaily={() => setIsDaily(!isDaily)}
                  hasResources={hasResources}
                  onAddResources={() => setHasResources(true)}
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-5 py-3 bg-surface-1/50 shrink-0">
                {isLinkCopied ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-canvas text-ink rounded-md text-[12px] font-medium border border-border/60 shadow-sm transition-all">
                    <CheckCircle weight="fill" size={14} className="text-emerald-500" />
                    <span>Link copied</span>
                  </div>
                ) : (
                  <button onClick={handleCopyLink} className="p-1.5 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors" title="Copy meeting link">
                    <LinkIcon weight="bold" size={16} />
                  </button>
                )}
                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit || createRoomMutation.isPending || updateRoomMutation.isPending}
                    className="h-[30px] px-3.5 rounded-md bg-ink text-canvas hover:opacity-90 disabled:opacity-40 transition-all font-medium text-[13px] shadow-sm"
                  >
                    {createRoomMutation.isPending || updateRoomMutation.isPending ? "Saving..." : editRoomId ? "Save Changes" : "Create Room"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div ref={completionRef} className="p-8 flex flex-col items-center text-center justify-center relative">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <CheckCircle weight="bold" className="text-emerald-600 h-6 w-6" />
              </div>
              
              <div className="flex flex-col items-center w-full max-w-[320px]">
                <h3 className="text-[18px] font-semibold text-foreground mb-1 tracking-tight">Meeting Created Successfully</h3>
                <p className="text-[13px] text-muted-foreground mb-6">Your room "{title}" is ready to use.</p>
                
                {/* Room Code Card */}
                <div className="w-full bg-surface-1 border border-border/60 rounded-lg p-3 mb-8 flex flex-col items-center gap-2">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Room Code</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[16px] font-semibold text-foreground tracking-wide">{createdRoomCode}</span>
                    <button onClick={copyInviteLink} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-surface-2" title="Copy Invite Link">
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
                    href={`/rooms/${createdRoomId}`}
                    onClick={() => handleOpenChange(false)}
                    className={cn(
                      buttonVariants({ variant: "default" }),
                      "flex-1 text-[13px] h-[34px] font-medium bg-primary text-white hover:bg-primary/90 gap-2 flex items-center justify-center"
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

