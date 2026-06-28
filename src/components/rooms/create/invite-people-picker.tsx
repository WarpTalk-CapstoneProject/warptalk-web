import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Users, X, Plus } from "@phosphor-icons/react/dist/ssr";
import { PillButton } from "./pill-button";
import { useWorkspaces, useWorkspaceMembers } from "@/hooks/use-workspace";

export function InvitePeoplePicker({ emails, onChange }: { emails: string[]; onChange: (val: string[]) => void }) {
  const [input, setInput] = useState("");
  const active = emails.length > 0;
  
  const { data: workspacesData } = useWorkspaces(1, 100);
  const workspaceId = workspacesData?.items?.[0]?.id;
  const { data: membersData } = useWorkspaceMembers(workspaceId || "", 1, 100);
  const members = membersData?.items ?? [];

  // Safely extract members array
  const membersArray = members;

  const suggestedMembers = membersArray.filter((m: any) => 
    m.fullName && 
    m.fullName !== 'Unknown' && 
    !emails.includes(m.email || m.userId || m.id)
  );
  
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

  const addEmail = (email: string) => {
    if (!emails.includes(email)) {
      onChange([...emails, email]);
    }
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
      <PopoverContent align="start" className="w-[280px] p-2 bg-white rounded-xl shadow-xl border border-border/20">
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
              className="w-full h-8 pl-8 pr-3 text-[13px] bg-surface-1 border border-border/20 rounded-md focus:outline-none focus:ring-0 focus:border-border/20 text-ink"
              autoFocus
            />
          </div>
          {emails.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 max-h-[120px] overflow-y-auto">
              {emails.map(email => {
                const member = membersArray.find((m: any) => m.email === email || m.userId === email || m.id === email);
                const displayText = member?.fullName || email;
                return (
                  <div key={email} className="flex items-center justify-between text-[12px] bg-surface-2 px-2 py-1 rounded">
                    <span className="truncate max-w-[180px] text-ink">{displayText}</span>
                    <button onClick={() => removeEmail(email)} className="text-ink-muted hover:text-red-500">
                      <X size={12} weight="bold" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {suggestedMembers.length > 0 && (
            <div className="mt-3">
              <label className="text-[11px] font-medium text-ink-muted px-1 mb-1 block">Suggested Workspace Members</label>
              <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto">
                {suggestedMembers.map(member => (
                  <button 
                    key={member.id} 
                    onClick={() => addEmail(member.email || member.userId)}
                    className="flex items-center gap-2 text-[12px] hover:bg-surface-2 px-2 py-1.5 rounded transition-colors text-left"
                  >
                    <div className="h-6 w-6 rounded-full bg-surface-3 flex items-center justify-center shrink-0 overflow-hidden text-ink-muted font-medium text-[10px]">
                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt={member.fullName || 'User'} className="h-full w-full object-cover" />
                      ) : (
                        (member.fullName || member.email || 'U').charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="truncate font-medium text-ink leading-tight">{member.fullName}</span>
                      {member.email && (
                        <span className="truncate text-ink-muted text-[10px] leading-tight">{member.email}</span>
                      )}
                    </div>
                    <Plus size={12} weight="bold" className="ml-auto text-ink-muted" />
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
