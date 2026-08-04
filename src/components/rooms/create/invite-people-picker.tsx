import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Users, X, Plus } from "@phosphor-icons/react/dist/ssr";
import { PillButton } from "./pill-button";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAuthStore } from "@/stores/auth-store";
import { matchesSearchText } from "@/lib/search-text";

export function isValidInviteEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function InvitePeoplePicker({
  emails,
  onChange,
}: {
  emails: string[];
  onChange: (val: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const user = useAuthStore((state) => state.user);
  const active = emails.length > 0;

  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId,
  );

  // The server holds the authoritative member list and only returns one page, so the typed
  // term has to reach it — a workspace with more members than the page size would otherwise
  // never surface anyone past the first page. Debounced so each keystroke is not a request.
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);

  const { data: membersData } = useWorkspaceMembers(
    activeWorkspaceId || "",
    1,
    100,
    search,
  );
  const members = membersData?.items ?? [];

  // Names for the invited chips have to survive the list narrowing: once a search term is in
  // flight the fetched page no longer contains the members already added, so remember every
  // name seen instead of looking it up in the current page.
  const knownNamesRef = useRef(new Map<string, string>());
  for (const member of members) {
    const email = member.email?.toLowerCase();
    if (email && member.fullName && member.fullName !== "Unknown") {
      knownNamesRef.current.set(email, member.fullName);
    }
  }

  const suggestedMembers = members.filter(
    (m) =>
      m.fullName &&
      m.fullName !== "Unknown" &&
      Boolean(m.email) &&
      isValidInviteEmail(m.email ?? "") &&
      m.userId !== user?.id &&
      m.email?.toLowerCase() !== user?.email.toLowerCase() &&
      !emails.includes((m.email ?? "").toLowerCase()) &&
      // Narrow locally too: the debounced request lags the keystroke, and without this the
      // list keeps showing everyone until it lands (WT-231).
      matchesSearchText(input, m.fullName, m.email),
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      const email = input.trim().toLowerCase();
      if (!isValidInviteEmail(email)) {
        setInputError("Enter a complete email address.");
        return;
      }
      if (emails.includes(email)) {
        setInputError("This email is already invited.");
        return;
      }
      onChange([...emails, email]);
      setInput("");
      setInputError("");
    }
  };

  const removeEmail = (email: string) => {
    onChange(emails.filter((e) => e !== email));
  };

  const addEmail = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidInviteEmail(normalizedEmail)) {
      setInputError("This workspace member does not have a valid email.");
      return;
    }
    if (!emails.includes(normalizedEmail)) {
      onChange([...emails, normalizedEmail]);
    }
    setInputError("");
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <PillButton
            icon={Users}
            label={active ? `${emails.length} people` : "People"}
            active={active}
          />
        }
      />
      <PopoverContent
        align="start"
        className="w-[280px] p-2 bg-white rounded-xl shadow-xl border border-border/20"
      >
        <div className="space-y-2">
          <label className="text-[11px] font-medium text-ink-muted px-1">
            Invite by Email
          </label>
          <div className="relative">
            <Users
              weight="duotone"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted/70 h-3.5 w-3.5 pointer-events-none"
            />
            <input
              type="email"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setInputError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="name@company.com..."
              className="w-full h-8 pl-8 pr-3 text-[13px] bg-surface-1 border border-border/20 rounded-md focus:outline-none focus:ring-0 focus:border-border/20 text-ink"
              autoFocus
            />
          </div>
          {inputError ? (
            <p className="px-1 text-[11px] text-destructive">{inputError}</p>
          ) : null}
          {emails.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 max-h-[120px] overflow-y-auto">
              {emails.map((email) => {
                const displayText = knownNamesRef.current.get(email) || email;
                return (
                  <div
                    key={email}
                    className="flex items-center justify-between text-[12px] bg-surface-2 px-2 py-1 rounded"
                  >
                    <span className="truncate max-w-[180px] text-ink">
                      {displayText}
                    </span>
                    <button
                      onClick={() => removeEmail(email)}
                      className="text-ink-muted hover:text-red-500"
                    >
                      <X size={12} weight="bold" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {suggestedMembers.length > 0 && (
            <div className="mt-3">
              <label className="text-[11px] font-medium text-ink-muted px-1 mb-1 block">
                Suggested Workspace Members
              </label>
              <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto">
                {suggestedMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => addEmail(member.email ?? "")}
                    className="flex items-center gap-2 text-[12px] hover:bg-surface-2 px-2 py-1.5 rounded transition-colors text-left"
                  >
                    <div className="relative h-6 w-6 rounded-full bg-surface-3 flex items-center justify-center shrink-0 overflow-hidden text-ink-muted font-medium text-[10px]">
                      {member.avatarUrl ? (
                        <Image
                          src={member.avatarUrl}
                          alt={member.fullName || "User"}
                          fill
                          sizes="24px"
                          className="object-cover"
                        />
                      ) : (
                        (member.fullName || member.email || "U")
                          .charAt(0)
                          .toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate font-medium text-ink leading-tight">
                        {member.fullName}
                      </span>
                      {member.email && (
                        <span className="truncate text-ink-muted text-[10px] leading-tight">
                          {member.email}
                        </span>
                      )}
                    </div>
                    <Plus
                      size={12}
                      weight="bold"
                      className="ml-auto text-ink-muted"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
