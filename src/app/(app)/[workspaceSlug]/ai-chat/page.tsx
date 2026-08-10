"use client";

import { FormEvent, useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useAssistantConversation,
  useAssistantConversations,
  useCreateAssistantConversation,
  useSendAssistantMessage,
} from "@/hooks/use-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AssistantConversationDto } from "@/types/assistant";

export default function AiChatPage() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const conversationsQuery = useAssistantConversations(workspaceId);
  const createConversation = useCreateAssistantConversation();
  const sendMessage = useSendAssistantMessage();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const conversations = conversationsQuery.data ?? [];
  const selectedId = activeId ?? conversations[0]?.id ?? null;
  const conversationQuery = useAssistantConversation(selectedId);
  const messages = conversationQuery.data?.messages ?? [];

  async function handleCreateConversation() {
    if (!workspaceId || createConversation.isPending) return;
    const conversation = await createConversation.mutateAsync(workspaceId);
    setActiveId(conversation.id);
    await conversationsQuery.refetch();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !workspaceId || sendMessage.isPending) return;

    let conversationId = selectedId;
    if (!conversationId) {
      const conversation = await createConversation.mutateAsync(workspaceId);
      conversationId = conversation.id;
      setActiveId(conversationId);
    }

    setDraft("");
    await sendMessage.mutateAsync({ conversationId, content });
    await conversationQuery.refetch();
    await conversationsQuery.refetch();
  }

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="min-h-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle className="text-base">AI conversations</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleCreateConversation()}
            disabled={!workspaceId || createConversation.isPending}
          >
            New
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 overflow-y-auto p-2">
          {conversationsQuery.isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Loading conversations…</p>
          ) : conversationsQuery.isError ? (
            <p className="p-3 text-sm text-destructive">Could not load conversations.</p>
          ) : conversations.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              Create a conversation to ask WarpTalk AI about this workspace.
            </p>
          ) : (
            <div className="space-y-1">
              {conversations.map((conversation) => (
                <ConversationButton
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === selectedId}
                  onClick={() => setActiveId(conversation.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle className="text-base">
            {conversationQuery.data?.title ?? "WarpTalk AI"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {conversationQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading messages…</p>
            ) : conversationQuery.isError ? (
              <p className="text-sm text-destructive">Could not load this conversation.</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ask a question about your meetings, transcripts, or workspace documents.
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                    message.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.status === "failed" ? (
                    <p className="mt-1 text-xs text-destructive">Message processing failed.</p>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <form className="flex gap-2 border-t pt-4" onSubmit={handleSubmit}>
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask WarpTalk AI about this workspace…"
              disabled={!workspaceId || sendMessage.isPending}
              maxLength={4000}
            />
            <Button
              type="submit"
              disabled={!draft.trim() || !workspaceId || sendMessage.isPending}
            >
              {sendMessage.isPending ? "Sending…" : "Send"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ConversationButton({
  conversation,
  active,
  onClick,
}: {
  conversation: AssistantConversationDto;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted",
        active && "bg-muted",
      )}
    >
      <p className="truncate text-sm font-medium">{conversation.title}</p>
      <p className="text-xs text-muted-foreground">
        {conversation.lastMessageAt
          ? new Date(conversation.lastMessageAt).toLocaleString()
          : new Date(conversation.createdAt).toLocaleString()}
      </p>
    </button>
  );
}
