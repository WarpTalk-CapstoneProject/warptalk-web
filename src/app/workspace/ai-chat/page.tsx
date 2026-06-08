"use client";

import { useMemo, useRef, useState } from "react";
import { Robot, FileText, ChatCircleText, DotsThree, Paperclip, MagnifyingGlass, PaperPlaneRight, Trash } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { workspaceArtifacts } from "@/lib/workspace-preview";

type Conversation = {
  id: number;
  title: string;
  context: string;
  messages: { role: "user" | "assistant"; text: string }[];
};

const initialConversations: Conversation[] = [
  { id: 1, title: "Investor follow-ups", context: "Investor Q&A Translation", messages: [{ role: "assistant", text: "The investor meeting transcript is ready. Ask about decisions, risks, or action items." }] },
  { id: 2, title: "Board decision analysis", context: "Board Review Translation", messages: [{ role: "assistant", text: "I found two follow-up requirements in the finalized board transcript." }] },
  { id: 3, title: "Product research themes", context: "Product Research Debrief", messages: [{ role: "assistant", text: "The product transcript is attached. I can group feedback themes or produce a concise brief." }] },
];

export default function WorkspaceAiChatPage() {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(() => {
    if (typeof window === "undefined") return 1;
    const context = sessionStorage.getItem("workspace-ai-context");
    return initialConversations.find((item) => item.context === context)?.id ?? 1;
  });
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const active = conversations.find((item) => item.id === activeId) ?? conversations[0];

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return conversations.filter((item) => !normalized || [item.title, item.context].some((value) => value.toLowerCase().includes(normalized)));
  }, [conversations, query]);

  function sendMessage() {
    const text = message.trim();
    if (!text || !active) return;
    setConversations((current) => current.map((conversation) => conversation.id === active.id ? {
      ...conversation,
      messages: [...conversation.messages, { role: "user", text }, { role: "assistant", text: `Preview analysis for “${text}”: the attached ${conversation.context} transcript contains decisions, participants, and follow-up actions that Workspace Managers can review.` }],
    } : conversation));
    setMessage("");
  }

  function createConversation() {
    const id = Date.now();
    const context = workspaceArtifacts[0].meeting;
    setConversations((current) => [{ id, title: "New workspace analysis", context, messages: [{ role: "assistant", text: "Choose a meeting transcript or ask a workspace-wide question." }] }, ...current]);
    setActiveId(id);
  }

  function removeConversation(id: number) {
    setConversations((current) => current.filter((item) => item.id !== id));
    if (activeId === id) setActiveId(conversations.find((item) => item.id !== id)?.id ?? 0);
  }

  return (
    <div className="grid h-full min-h-[620px] grid-cols-[280px_minmax(0,1fr)] gap-3 pb-2">
      <Card className="flex min-h-0 flex-col overflow-hidden rounded-3xl border-white/70 bg-white/88 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <div><CardTitle className="text-base">Workspace AI</CardTitle><p className="text-xs text-muted-foreground">Manager conversations</p></div>
            <Button size="icon-sm" className="rounded-full bg-neutral-950 text-white" onClick={createConversation}><ChatCircleText weight="light" /></Button>
          </div>
          <div className="relative pt-2">
            <MagnifyingGlass weight="light" className="absolute left-3 top-[calc(50%+4px)] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="MagnifyingGlass conversations..." className="h-9 rounded-xl bg-white pl-9" />
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {visible.map((conversation) => (
            <div key={conversation.id} className={`group flex items-center gap-2 rounded-2xl border p-2 transition ${activeId === conversation.id ? "border-neutral-950 bg-neutral-950 text-white" : "bg-white hover:border-neutral-400"}`}>
              <button onClick={() => setActiveId(conversation.id)} className="min-w-0 flex-1 p-1 text-left">
                <p className="truncate text-sm font-medium">{conversation.title}</p>
                <p className={`truncate text-xs ${activeId === conversation.id ? "text-white/60" : "text-muted-foreground"}`}>{conversation.context}</p>
              </button>
              <Button variant="ghost" size="icon-sm" className={activeId === conversation.id ? "text-white hover:bg-white/10 hover:text-white" : ""} onClick={() => removeConversation(conversation.id)} title="Delete conversation"><Trash weight="light" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden rounded-3xl border-white/70 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        {active ? (
          <>
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b px-5 py-3">
              <div><CardTitle className="text-base">{active.title}</CardTitle><p className="text-xs text-muted-foreground">Context: {active.context}</p></div>
              <Button variant="ghost" size="icon-sm"><DotsThree weight="light" /></Button>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              {active.messages.map((item, index) => (
                <div key={`${item.role}-${index}`} className={`flex items-start gap-2 ${item.role === "user" ? "justify-end" : ""}`}>
                  {item.role === "assistant" && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white"><Robot weight="light" className="h-4 w-4" /></span>}
                  <div className={`max-w-[76%] rounded-2xl px-4 py-3 text-sm leading-6 ${item.role === "user" ? "bg-neutral-950 text-white" : "border bg-white"}`}>{item.text}</div>
                </div>
              ))}
            </CardContent>
            <div className="border-t p-4">
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2 text-xs text-muted-foreground"><FileText weight="light" className="h-4 w-4" />{active.context} transcript attached</div>
              <div className="flex items-center gap-2 rounded-2xl border bg-white p-2">
                <Button variant="ghost" size="icon-sm" onClick={() => fileInput.current?.click()}><Paperclip weight="light" /></Button>
                <input ref={fileInput} type="file" className="hidden" accept=".pdf,.txt,.doc,.docx,image/*,audio/*" onChange={(event) => event.target.files?.[0] && toast.success(`${event.target.files[0].name} attached to this conversation.`)} />
                <Input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendMessage()} placeholder="Ask about meetings, transcripts, costs, or teams..." className="h-9 flex-1 border-0 shadow-none focus-visible:ring-0" />
                <Button size="icon-sm" className="rounded-xl bg-neutral-950 text-white" onClick={sendMessage}><PaperPlaneRight weight="light" /></Button>
              </div>
            </div>
          </>
        ) : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Create a conversation to begin.</div>}
      </Card>
    </div>
  );
}
