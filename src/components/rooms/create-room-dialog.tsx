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

const languageOptions = [
  { code: "vi-VN", label: "Vietnamese" },
  { code: "en-US", label: "English" },
  { code: "ja-JP", label: "Japanese" },
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
  const [sourceLanguage, setSourceLanguage] = useState<string>("en-US");
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["vi-VN"]);
  const [isMultiLang, setIsMultiLang] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [meetingTemplate, setMeetingTemplate] = useState("Event");
  
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [createdRoomCode, setCreatedRoomCode] = useState<string | null>(null);
  const createRoomMutation = useCreateTranslationRoom();
  
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
        setSelectedLanguages(["vi-VN"]);
        setSourceLanguage("en-US");
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

  const workspaceName = "FPT-SEP490";

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

// Subcomponents - Pill Style Options

function PillButton({ icon: Icon, label, active, onClick }: { icon: React.ElementType, label?: React.ReactNode, active: boolean, onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors border shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        active 
          ? "border-border bg-surface-1 text-ink hover:bg-surface-2" 
          : "border-border/60 bg-white dark:bg-transparent text-ink-muted hover:text-ink hover:border-border hover:bg-surface-1"
      )}
    >
      <Icon weight={active ? "duotone" : "bold"} size={14} className={active ? "text-ink" : "text-ink-muted/70"} />
      {label}
    </button>
  );
}

export function OptionsMenu({ 
  hasScheduledAt, 
  onAddScheduledAt,
  isMultiLang,
  onToggleMultiLang
}: { 
  hasScheduledAt?: boolean; 
  onAddScheduledAt?: () => void;
  isMultiLang: boolean;
  onToggleMultiLang: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex items-center justify-center h-[26px] w-[26px] rounded-full border border-border/60 bg-white dark:bg-transparent shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-ink-muted hover:text-ink hover:border-border hover:bg-surface-1 transition-colors cursor-pointer">
          <DotsThree weight="bold" size={16} />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[200px] p-1 bg-canvas rounded-xl shadow-xl border-border/50">
        <Command className="bg-transparent">
          <CommandList>
            {!hasScheduledAt && (
              <CommandItem onSelect={onAddScheduledAt} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                <CalendarIcon weight="duotone" size={14} />
                Date & Time
              </CommandItem>
            )}
            <CommandItem 
              onSelect={() => {
                onToggleMultiLang();
              }} 
              className="text-[13px] rounded-md cursor-pointer flex items-center justify-between px-2 py-2 aria-selected:bg-surface-2"
            >
              <div className="flex items-center gap-2">
                <GlobeHemisphereWest weight="duotone" size={16} />
                <span className="font-medium text-ink whitespace-nowrap">Multi-lang</span>
              </div>
              <Switch checked={isMultiLang} />
            </CommandItem>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function InvitePeoplePicker({ emails, onChange }: { emails: string[]; onChange: (val: string[]) => void }) {
  const [input, setInput] = useState("");
  const active = emails.length > 0;
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      const email = input.trim();
      if (!emails.includes(email) && email.includes("@")) {
        onChange([...emails, email]);
      }
      setInput("");
    }
  };

  const removeEmail = (email: string) => {
    onChange(emails.filter(e => e !== email));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div>
          <PillButton 
            icon={Users} 
            label={active ? `${emails.length} people` : "People"} 
            active={active} 
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-2 bg-canvas rounded-xl shadow-xl border-border/50">
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-ink-muted px-1">Invite by Email</label>
          <div className="relative">
            <Users weight="duotone" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted/70 h-3.5 w-3.5 pointer-events-none" />
            <input
              type="email"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="name@company.com..."
              className="w-full h-8 pl-8 pr-3 text-[13px] bg-surface-1 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ink/20 text-ink"
              autoFocus
            />
          </div>
          {emails.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 max-h-[120px] overflow-y-auto">
              {emails.map(email => (
                <div key={email} className="flex items-center justify-between text-[12px] bg-surface-2 px-2 py-1 rounded">
                  <span className="truncate max-w-[180px] text-ink">{email}</span>
                  <button onClick={() => removeEmail(email)} className="text-ink-muted hover:text-red-500">
                    <X size={12} weight="bold" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StartTimePicker({ scheduledAt, onChange, onRemove }: { scheduledAt: Date; onChange: (value: Date) => void; onRemove: () => void }) {
  const [timeStr, setTimeStr] = useState(format(scheduledAt, "HH:mm"));

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTimeStr(val);
    const [hours, minutes] = val.split(":").map(Number);
    if (!isNaN(hours) && !isNaN(minutes)) {
      const newDate = setMinutes(setHours(scheduledAt, hours), minutes);
      onChange(newDate);
    }
  };

  const handleDateSelect = (d: Date | undefined) => {
    if (d) {
      const [hours, minutes] = timeStr.split(":").map(Number);
      const newDate = setMinutes(setHours(d, hours || 0), minutes || 0);
      onChange(newDate);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div>
          <PillButton 
            icon={CalendarIcon} 
            label={format(scheduledAt, "MMM d, h:mm a")} 
            active={true} 
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3 bg-canvas rounded-xl shadow-xl border-border/50">
        <Calendar
          mode="single"
          selected={scheduledAt}
          onSelect={handleDateSelect}
          initialFocus
          className="p-0 border-none bg-transparent"
        />
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/40">
          <input
            type="time"
            value={timeStr}
            onChange={handleTimeChange}
            className="w-full h-8 px-2 text-[13px] bg-surface-1 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-ink/20 text-ink"
          />
          <button 
            onClick={onRemove}
            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md transition-colors shrink-0"
            title="Remove schedule"
          >
            <Trash weight="bold" size={14} />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function getFlagEmoji(locale: string) {
  if (!locale) return "";
  const parts = locale.split("-");
  const countryCode = parts.length > 1 ? parts[1].toUpperCase() : "";
  if (!countryCode) return "";
  const codePoints = countryCode.split("").map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function LanguageSelector({ 
  source, 
  onSourceChange, 
  targets, 
  onTargetsChange,
  isMultiLang
}: { 
  source: string; 
  onSourceChange: (lang: string) => void;
  targets: string[]; 
  onTargetsChange: (languages: string[]) => void;
  isMultiLang: boolean;
}) {
  function toggleTarget(code: string) {
    if (isMultiLang) {
      if (targets.includes(code)) {
        if (targets.length === 1) return; // Must have at least one target
        onTargetsChange(targets.filter((item) => item !== code));
      } else {
        onTargetsChange([...targets, code]);
      }
    } else {
      onTargetsChange([code]);
    }
  }

  const targetLang = targets.length > 0 ? targets[0] : "vi-VN";

  return (
    <div className="flex items-center gap-1 px-1 py-1 rounded-full border border-border/60 bg-transparent select-none text-[13px]">
      <Popover>
        <PopoverTrigger asChild>
          <div className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-full cursor-pointer hover:bg-surface-2 transition-colors">
            <span className="leading-none text-[14px]">{getFlagEmoji(source)}</span>
            <span className="font-medium text-ink">{languageOptions.find(o => o.code === source)?.label.substring(0, 2).toUpperCase() || source.split('-')[0].toUpperCase()}</span>
          </div>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[180px] rounded-xl bg-canvas border-border/50 p-1.5 shadow-xl z-[100]">
          <Command className="bg-transparent">
            <CommandList>
              <CommandGroup heading="Source Language" className="text-[11px] text-ink-muted">
                {languageOptions.map((language) => {
                  const isSelected = source === language.code;
                  return (
                    <CommandItem
                      key={language.code}
                      onSelect={() => onSourceChange(language.code)}
                      className="rounded-md text-[13px] aria-selected:bg-surface-2 mb-0.5 cursor-pointer flex items-center gap-2"
                    >
                      <span className="text-[14px] leading-none">{getFlagEmoji(language.code)}</span>
                      <span className="truncate font-medium text-ink">{language.label}</span>
                      {isSelected && <CheckCircle weight="fill" className="ml-auto text-emerald-500 h-3.5 w-3.5" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <span className="text-muted-foreground/40 font-bold px-1">
        {isMultiLang ? (
          <span className="text-[13px]">;</span>
        ) : (
          <span className="text-[11px]">→</span>
        )}
      </span>

      <Popover>
        <PopoverTrigger asChild>
          <div className="flex items-center outline-none cursor-pointer">
            {targets.map((t, i) => (
              <div key={t} className="flex items-center">
                {i > 0 && <span className="text-muted-foreground/40 font-bold text-[13px] px-1">;</span>}
                <div className="flex items-center gap-1.5 px-2.5 py-[3px] rounded-full hover:bg-surface-2 transition-colors">
                  <span className="leading-none text-[14px]">{getFlagEmoji(t)}</span>
                  {targets.length === 1 && !isMultiLang && (
                    <span className="font-medium text-ink">{languageOptions.find(o => o.code === targetLang)?.label.substring(0, 2).toUpperCase() || targetLang.split('-')[0].toUpperCase()}</span>
                  )}
                </div>
              </div>
            ))}
            {isMultiLang && (
              <div className="flex items-center">
                <span className="text-muted-foreground/40 font-bold text-[13px] px-1">;</span>
                <div className="flex items-center justify-center px-2 py-[5px] rounded-full hover:bg-surface-2 transition-colors">
                  <Plus weight="bold" size={12} className="text-ink-muted" />
                </div>
              </div>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[180px] rounded-xl bg-canvas border-border/50 p-1.5 shadow-xl z-[100]">
          <Command className="bg-transparent">
            <CommandList>
              <CommandGroup heading="Target Languages" className="text-[11px] text-ink-muted">
                {languageOptions.map((language) => {
                  const isSelected = targets.includes(language.code);
                  return (
                    <CommandItem
                      key={language.code}
                      onSelect={() => toggleTarget(language.code)}
                      className="rounded-md text-[13px] aria-selected:bg-surface-2 mb-0.5 cursor-pointer flex items-center gap-2"
                    >
                      <span className="text-[14px] leading-none">{getFlagEmoji(language.code)}</span>
                      <span className="truncate font-medium text-ink">{language.label}</span>
                      {isSelected && <CheckCircle weight="fill" className="ml-auto text-emerald-500 h-3.5 w-3.5" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function TemplatePicker({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="flex items-center gap-1 hover:bg-surface-2 px-1.5 py-0.5 rounded transition-colors text-ink cursor-pointer">
          {value} <CaretDown size={12} weight="bold" className="text-ink-muted" />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-1 bg-canvas rounded-xl shadow-xl border-border/50">
        <Command className="bg-transparent">
          <CommandList>
             <CommandGroup heading="Meeting Type" className="text-[11px] text-ink-muted">
                <CommandItem onSelect={() => onChange("Event")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <CalendarIcon weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Event</span>
                </CommandItem>
                <CommandItem onSelect={() => onChange("Channel Meeting")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <Monitor weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Channel Meeting</span>
                </CommandItem>
                <CommandItem onSelect={() => onChange("Webinar")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <VideoCamera weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Webinar</span>
                </CommandItem>
                <CommandItem onSelect={() => onChange("Company Meeting")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <UsersThree weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Company Meeting</span>
                </CommandItem>
                <CommandItem onSelect={() => onChange("Virtual Appointment")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <MicrophoneStage weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Virtual Appointment</span>
                </CommandItem>
                <CommandItem onSelect={() => onChange("Live Event")} className="text-[13px] rounded-md cursor-pointer flex items-center gap-2 px-2 py-1.5 aria-selected:bg-surface-2">
                  <Broadcast weight="duotone" size={14} className="text-ink-muted" />
                  <span className="text-ink font-medium">Live Event</span>
                </CommandItem>
             </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
