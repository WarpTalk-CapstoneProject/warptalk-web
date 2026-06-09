"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { MagnifyingGlass, SquaresFour, CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useUIStore } from "@/stores/ui-store";
import { useTranslationRooms } from "@/hooks/use-translationRooms";

export function SearchMeetingDialog() {
  const router = useRouter();
  const searchMeetingModalOpen = useUIStore((state) => state.searchMeetingModalOpen);
  const setSearchMeetingModalOpen = useUIStore((state) => state.setSearchMeetingModalOpen);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useTranslationRooms({
    search: searchQuery,
    pageSize: 10,
  });

  const meetings = data?.items || [];

  const handleSelect = (roomId: string) => {
    router.push(`/rooms/${roomId}`);
    setSearchMeetingModalOpen(false);
  };

  return (
    <CommandDialog open={searchMeetingModalOpen} onOpenChange={setSearchMeetingModalOpen} className="max-w-[800px]">
      <Command className="rounded-xl" shouldFilter={false}>
        <CommandInput 
          placeholder="Search meetings by name, code..." 
          value={searchQuery}
          onValueChange={setSearchQuery}
          autoFocus 
        />
        <CommandList>
          {isLoading && <div className="p-4 text-sm text-center text-muted-foreground">Searching meetings...</div>}
          {!isLoading && meetings.length > 0 && (
            <CommandGroup heading="Meetings">
              {meetings.map((meeting) => (
                <CommandItem key={meeting.id} value={meeting.id} onSelect={() => handleSelect(meeting.id)}>
                  <SquaresFour className="h-4 w-4 mr-2 text-muted-foreground" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium text-[13px] text-foreground truncate">{meeting.title}</span>
                    <span className="text-[12px] text-muted-foreground mt-0.5 truncate flex items-center gap-2">
                      <span className="bg-surface-2 border border-border px-1 rounded text-[10px] font-mono">{meeting.translationRoomCode}</span>
                      <span className="flex items-center gap-1"><CalendarBlank className="w-3 h-3" />{format(new Date(meeting.createdAt), "MMM d, yyyy")}</span>
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
