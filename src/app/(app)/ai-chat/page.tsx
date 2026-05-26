"use client";

import { useState } from "react";
import { BotMessageSquare, Send, Sparkles, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const initialMessages = [
  {
    role: "assistant",
    content: "Ask me about recent rooms, transcript decisions, or translation quality patterns.",
  },
  {
    role: "user",
    content: "What changed after the board review session?",
  },
  {
    role: "assistant",
    content: "The preview data shows three follow-ups: rollout risks, investor Q&A, and terminology cleanup.",
  },
];

export default function AiChatPage() {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");

  const sendMessage = () => {
    const content = draft.trim();
    if (!content) return;
    setMessages((current) => [
      ...current,
      { role: "user", content },
      { role: "assistant", content: "Preview response: AI chat will connect to meeting context once backend retrieval is ready." },
    ]);
    setDraft("");
  };

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="flex min-h-[680px] flex-col shadow-sm">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <BotMessageSquare className="h-3.5 w-3.5 text-primary" />
                AI chat
              </div>
              <h1 className="font-heading text-base font-medium leading-snug">Chat with AI</h1>
              <CardDescription>Ask questions about previous rooms and transcript artifacts.</CardDescription>
            </div>
            <Badge variant="secondary">Preview</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col p-0">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}>
                {message.role === "assistant" ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </span>
                ) : null}
                <div
                  className={`max-w-[78%] rounded-lg border px-3 py-2 text-sm ${
                    message.role === "user" ? "bg-primary text-primary-foreground" : "bg-background"
                  }`}
                >
                  {message.content}
                </div>
                {message.role === "user" ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <User className="h-4 w-4" />
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="border-t bg-muted/30 p-4">
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendMessage();
                }}
                placeholder="Ask anything about your meetings..."
              />
              <Button onClick={sendMessage}>
                <Send className="mr-2 h-4 w-4" />
                Send
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <aside className="space-y-4">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Suggested prompts</CardTitle>
            <CardDescription>Fast starts for meeting intelligence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              "Summarize action items from this week",
              "Which rooms need terminology cleanup?",
              "Show sessions with low translation confidence",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setDraft(prompt)}
                className="w-full rounded-lg border bg-background p-3 text-left text-sm transition hover:bg-muted/50"
              >
                {prompt}
              </button>
            ))}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
