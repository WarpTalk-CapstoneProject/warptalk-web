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
  Paperclip,
  CaretDown,
  Monitor,
  VideoCamera,
  UsersThree,
  MicrophoneStage,
  Broadcast
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useCreateTranslationRoom } from "@/hooks/use-translationRooms";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaces, useWorkspaceMembers } from "@/hooks/use-workspace";
import { OptionsMenu } from "./create/options-menu";
import { TemplatePicker } from "./create/template-picker";
import { InvitePeoplePicker } from "./create/invite-people-picker";
import { StartTimePicker } from "./create/start-time-picker";
import { LanguageSelector } from "./create/language-selector";

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
  const user = useAuthStore((state) => state.user);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [sourceLanguage, setSourceLanguage] = useState<string>("en");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["vi"]);
  const [isMultiLang, setIsMultiLang] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [meetingTemplate, setMeetingTemplate] = useState("Event");
  
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const createRoomMutation = useCreateTranslationRoom();
  const { data: workspaces } = useWorkspaces();
  const workspace = workspaces?.[0];
  
  const completionRef = useRef<HTMLDivElement | null>(null);

  const participantCount = 100; // default for UI
  const validation = {
    workspace: Boolean(workspace?.id),
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
        setIsExpanded(false);
        setCreatedRoomId(null);
        setCreatedRoomCode(null);
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

  async function createPreviewRoom() {
    if (!canSubmit) {
      toast.error("Please complete all required fields.");
      return;
    }

    try {
      const room = await createRoomMutation.mutateAsync({
        workspaceId: workspace?.id,
        title: title.trim(),
        description: description.trim() || undefined,
        translationRoomType: scheduledAt ? "scheduled" : "instant",
        maxParticipants: participantCount,
        sourceLanguage: sourceLanguage,
        targetLanguages: selectedLanguages,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : undefined,
      });
      setCreatedRoomId(room.id);
      setCreatedRoomCode(room.translationRoomCode);
      toast.success("Room created successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create room.");
    }
  }

  async function copyInviteLink() {
    await navigator.clipboard?.writeText(inviteLink);
    toast.success("Invite link copied.");
  }

  const workspaceName = workspace?.name ?? "Workspace";

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent 
        overlayClassName="!bg-black/40 !backdrop-blur-none" 
        className={cn(
          "max-w-[calc(100vw-2rem)] sm:max-w-[750px] w-full p-0 border-border/60 bg-white dark:bg-zinc-950 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden top-[12vh] !translate-y-0 [transition-property:height,top,bottom,max-height] duration-300",
          isExpanded && "top-[5vh] bottom-[5vh] sm:h-[90vh] flex flex-col"
        )}
      >
        <DialogTitle className="sr-only">Create new meeting</DialogTitle>
        
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
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-5 py-3 bg-surface-1/50 shrink-0">
                <button className="p-1.5 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors" title="Attach file">
                  <Paperclip weight="bold" size={16} />
                </button>
                <div className="flex items-center gap-4">
                  <Button
                    onClick={createPreviewRoom}
                    disabled={!canSubmit || createRoomMutation.isPending}
                    className="h-[30px] px-3.5 rounded-md bg-ink text-canvas hover:opacity-90 disabled:opacity-40 transition-all font-medium text-[13px] shadow-sm"
                  >
                    {createRoomMutation.isPending ? "Creating..." : "Create Room"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div ref={completionRef} className="p-8 flex items-start gap-5">
              <div className="h-12 w-12 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
                <CheckCircle weight="duotone" className="text-emerald-500 h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-[16px] font-medium text-ink mb-1">{title}</h3>
                <p className="text-[13px] text-ink-muted mb-5">
                  Room Code: <span className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-ink">{createdRoomCode}</span>
                </p>

                <div className="flex items-center gap-3">
                  <Link 
                    href={`/rooms/${createdRoomId}/setup`} 
                    onClick={() => handleOpenChange(false)}
                    className="flex h-8 items-center gap-2 rounded-md bg-ink px-3.5 text-[13px] font-medium text-canvas transition-all hover:opacity-90 shadow-sm"
                  >
                    <SlidersHorizontal weight="duotone" className="h-4 w-4" />
                    Setup Room
                  </Link>
                  <button
                    type="button"
                    onClick={copyInviteLink}
                    className="flex h-8 items-center gap-2 rounded-md border border-border/60 bg-surface-1 px-3.5 text-[13px] font-medium text-ink transition-all hover:bg-surface-2 shadow-sm"
                  >
                    <Copy weight="duotone" className="h-4 w-4 text-ink-muted" />
                    Copy Link
                  </button>
                </div>
              </div>
              <button 
                onClick={() => handleOpenChange(false)}
                className="p-1.5 rounded-md hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors absolute top-4 right-4"
              >
                <X weight="bold" size={16} />
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

