"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useAssistantConversation,
  useAssistantConversations,
  useCreateAssistantConversation,
  usePluginConnectUrl,
  useSendAssistantMessage,
} from "@/hooks/use-assistant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AssistantQuestionCard,
  parseAssistantQuestions,
  type AssistantQuestion,
} from "@/components/layout/assistant-question-card";
import { AssistantMarkdown } from "@/components/assistant/assistant-markdown";
import { userMessageDisplayText } from "@/lib/assistant/confirmation-answer";
import {
  PluginConnectionActionCard,
  parsePluginConnectionAction,
  type PluginConnectionAction,
} from "@/components/layout/plugin-connection-action-card";
import {
  PluginOperatorSetupCard,
  parsePluginOperatorSetupAction,
  type PluginOperatorSetupAction,
} from "@/components/layout/plugin-operator-setup-card";
import { openProviderConsent } from "@/lib/assistant/open-provider-consent";
import { isDesktopApp } from "@/lib/desktop/bridge";
import { createHubConnection } from "@/lib/realtime/signalr";
import { cn } from "@/lib/utils";
import type { AssistantConversationDto } from "@/types/assistant";

export default function AiChatPage() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const conversationsQuery = useAssistantConversations(workspaceId);
  const createConversation = useCreateAssistantConversation();
  const sendMessage = useSendAssistantMessage();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingQuestions, setPendingQuestions] = useState<AssistantQuestion[] | null>(null);
  // One slot per card, as in the WarpBot widget (WT-688). This page used to keep only the
  // questions, so a Connect prompt or an operator-setup notice arrived and vanished without trace.
  const [pendingPluginConnection, setPendingPluginConnection] =
    useState<PluginConnectionAction | null>(null);
  const [pendingPluginSetup, setPendingPluginSetup] =
    useState<PluginOperatorSetupAction | null>(null);
  const connectPlugin = usePluginConnectUrl();

  // The same rule the widget and the meeting panel follow: a card lasts until the NEXT turn starts.
  // Cleared on send and on changing conversation, because a Connect card left over from an earlier
  // turn or another conversation would open an OAuth flow nobody asked for. Never when its own
  // turn completes or fails: the card is raised mid-turn and that answer is the one explaining it,
  // so clearing there erases it before anyone can press it.
  const clearPluginCards = useCallback(() => {
    setPendingPluginConnection(null);
    setPendingPluginSetup(null);
  }, []);

  const conversations = conversationsQuery.data ?? [];
  const selectedId = activeId ?? conversations[0]?.id ?? null;
  const conversationQuery = useAssistantConversation(selectedId);
  const messages = conversationQuery.data?.messages ?? [];

  // Through refs, not through the dependency array. A TanStack query result is a fresh
  // tracked proxy on every render, so depending on the query objects made this effect tear
  // down the hub and build a new one every single render - and an AssistantQuestion landing
  // during one of those gaps was simply lost, which is the confirmation card never appearing.
  const refetchConversationRef = useRef(conversationQuery.refetch);
  const refetchConversationsRef = useRef(conversationsQuery.refetch);
  useEffect(() => {
    refetchConversationRef.current = conversationQuery.refetch;
    refetchConversationsRef.current = conversationsQuery.refetch;
  }, [conversationQuery.refetch, conversationsQuery.refetch]);

  useEffect(() => {
    if (!selectedId) return;

    const connection = createHubConnection("/api/v1/assistant/chat-hub");

    connection.on(
      "AssistantQuestion",
      (payload: { conversationId: string; questionsJson: string }) => {
        if (payload.conversationId !== selectedId) return;
        const questions = parseAssistantQuestions(payload.questionsJson);
        const pluginConnection = parsePluginConnectionAction(payload.questionsJson);
        const pluginSetup = parsePluginOperatorSetupAction(payload.questionsJson);
        if (questions.length) setPendingQuestions(questions);
        // Setup wins, exactly as in the widget: "press Connect" and "no button will help" cannot
        // both be true of one failure, and setup is the one saying the ladder is exhausted.
        if (pluginSetup) {
          setPendingPluginSetup(pluginSetup);
          setPendingPluginConnection(null);
        } else if (pluginConnection) {
          setPendingPluginConnection(pluginConnection);
          setPendingPluginSetup(null);
        }
      },
    );
    const refetchBoth = (payload?: { conversationId?: string }) => {
      if (payload?.conversationId && payload.conversationId !== selectedId) return;
      // The plugin cards stay: this answer is the one explaining them. See clearPluginCards.
      void refetchConversationRef.current();
      void refetchConversationsRef.current();
    };
    connection.on("AssistantMessageCompleted", refetchBoth);
    connection.on("AssistantMessageFailed", refetchBoth);

    connection
      .start()
      .then(() => connection.invoke("JoinConversation", selectedId))
      .catch(() => {
        // The page still works by polling/refetch after POST; realtime cards are best effort.
      });

    return () => {
      void connection.stop();
    };
  }, [selectedId]);

  function selectConversation(id: string) {
    if (id !== selectedId) clearPluginCards();
    setActiveId(id);
  }

  async function handleCreateConversation() {
    if (!workspaceId || createConversation.isPending) return;
    const conversation = await createConversation.mutateAsync(workspaceId);
    selectConversation(conversation.id);
    await conversationsQuery.refetch();
  }

  // The widget's connect flow, unchanged: scoped to the workspace so its plugin policy applies,
  // tagged with the client, and every outcome said out loud — including the one where the server
  // connected the plugin itself and there is nothing to open.
  async function handlePluginConnectionAction(pluginKey: string) {
    try {
      const result = await connectPlugin.mutateAsync({
        pluginKey,
        client: isDesktopApp() ? "desktop" : "web",
        workspaceId: workspaceId ?? undefined,
      });
      const consentUrl = result.url;
      if (result.connected || !consentUrl) {
        toast.success("Plugin connected.");
      } else if (openProviderConsent(consentUrl)) {
        toast.message("Finish connecting this plugin in your browser.");
      } else {
        toast.error("Your browser blocked the consent window.", {
          action: {
            label: "Open it",
            onClick: () => openProviderConsent(consentUrl),
          },
        });
      }
    } catch {
      toast.error("Could not open the plugin connection flow.");
    }
  }

  async function sendContent(content: string) {
    content = content.trim();
    if (!content || !workspaceId || sendMessage.isPending) return;

    let conversationId = selectedId;
    if (!conversationId) {
      const conversation = await createConversation.mutateAsync(workspaceId);
      conversationId = conversation.id;
      setActiveId(conversationId);
    }

    setDraft("");
    setPendingQuestions(null);
    clearPluginCards();
    await sendMessage.mutateAsync({ conversationId, content });
    await conversationQuery.refetch();
    await conversationsQuery.refetch();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendContent(draft);
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
                  onClick={() => selectConversation(conversation.id)}
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
                  {message.role === "assistant" ? (
                    // Markdown, like every other WarpBot surface: this printed the source of the
                    // answer, so "**bold**" and a meeting marker reached the reader as characters.
                    <AssistantMarkdown withMeetingCards>{message.content}</AssistantMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap">
                      {userMessageDisplayText(message.content)}
                    </p>
                  )}
                  {message.status === "failed" ? (
                    <p className="mt-1 text-xs text-destructive">Message processing failed.</p>
                  ) : null}
                </div>
              ))
            )}
            {pendingQuestions ? (
              <div className="max-w-[85%]">
                <AssistantQuestionCard
                  questions={pendingQuestions}
                  disabled={sendMessage.isPending}
                  onSubmit={(answer) => void sendContent(answer)}
                />
              </div>
            ) : null}
            {pendingPluginConnection ? (
              <div className="max-w-[85%]">
                <PluginConnectionActionCard
                  action={pendingPluginConnection}
                  disabled={connectPlugin.isPending}
                  onDismiss={() => setPendingPluginConnection(null)}
                  onConnect={handlePluginConnectionAction}
                />
              </div>
            ) : null}
            {pendingPluginSetup ? (
              <div className="max-w-[85%]">
                <PluginOperatorSetupCard
                  action={pendingPluginSetup}
                  onDismiss={() => setPendingPluginSetup(null)}
                />
              </div>
            ) : null}
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
