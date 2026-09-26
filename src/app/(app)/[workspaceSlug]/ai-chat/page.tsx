"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useAssistantConversation,
  useAssistantConversations,
  useAssistantPlugins,
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
  AssistantPermissionPrompt,
  parsePermissionPrompt,
  type PermissionPrompt,
} from "@/components/assistant/permission-prompt";
import { openProviderConsent, pluginApiKeyPageHref } from "@/lib/assistant/open-provider-consent";
import { isDesktopApp } from "@/lib/desktop/bridge";
import { createHubConnection } from "@/lib/realtime/signalr";
import { cn } from "@/lib/utils";
import type { AssistantConversationDto } from "@/types/assistant";

export default function AiChatPage() {
  const t = useTranslations("aiChat");
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const conversationsQuery = useAssistantConversations(workspaceId);
  const createConversation = useCreateAssistantConversation();
  const sendMessage = useSendAssistantMessage();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingQuestions, setPendingQuestions] = useState<AssistantQuestion[] | null>(null);
  // What WarpBot is waiting on before it may act, as in the widget: one slot, one form, above the
  // composer. This page used to keep only the questions, so a Connect prompt arrived and vanished
  // without trace (WT-688).
  const [pendingPermission, setPendingPermission] = useState<PermissionPrompt | null>(null);
  // That prompt has been answered, and the last turn's end — null while a turn is open. The form
  // draws the running write from the pair; it used to disappear on the press, which said nothing
  // about a write that takes seconds.
  const [permissionAnswered, setPermissionAnswered] = useState(false);
  const [turnEndedAt, setTurnEndedAt] = useState<number | null>(null);
  const connectPlugin = usePluginConnectUrl();
  // The same catalog the widget reads, scoped to the workspace so its plugin policy applies. This
  // page passed an empty list, so one form carried the plugin's logo in the widget and a bare line
  // of mono here.
  const { data: assistantPlugins = [] } = useAssistantPlugins(workspaceId ?? undefined);

  // The same rule the widget and the meeting panel follow: a card lasts until the NEXT turn starts.
  // Cleared on send and on changing conversation, because a Connect card left over from an earlier
  // turn or another conversation would open an OAuth flow nobody asked for. Never when its own
  // turn completes or fails: the card is raised mid-turn and that answer is the one explaining it,
  // so clearing there erases it before anyone can press it.
  const clearPluginCards = useCallback(() => {
    setPendingPermission(null);
    setPermissionAnswered(false);
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
        const permission = parsePermissionPrompt(payload.questionsJson);
        if (questions.length) setPendingQuestions(questions);
        // A new ask replaces whatever the slot held, answered or not.
        if (permission) {
          setPendingPermission(permission);
          setPermissionAnswered(false);
        }
      },
    );
    const refetchBoth = (payload?: { conversationId?: string }) => {
      if (payload?.conversationId && payload.conversationId !== selectedId) return;
      // The plugin cards stay: this answer is the one explaining them. See clearPluginCards.
      // The permission form is told the turn is over — a stamp, not a clear, because the form
      // owns how long its receipt lives.
      setTurnEndedAt(Date.now());
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
      if (result.apiKeyRequired) {
        window.location.assign(pluginApiKeyPageHref(pluginKey));
        return;
      }
      const consentUrl = result.url;
      if (result.connected || !consentUrl) {
        toast.success(t("toasts.pluginConnected"));
      } else if (openProviderConsent(consentUrl)) {
        toast.message(t("toasts.pluginConnectOpenBrowser"));
      } else {
        toast.error(t("toasts.pluginConnectBlocked"), {
          action: {
            label: t("toasts.pluginConnectBlockedAction"),
            onClick: () => openProviderConsent(consentUrl),
          },
        });
      }
    } catch {
      toast.error(t("toasts.pluginConnectFailed"));
    }
  }

  // `keepPermissionPrompt` is set only by the permission form's own answer: every other send
  // starts a turn the prompt on screen has nothing to do with, and that is what ends it. An answer
  // is the one send that must not, because the form is what says the write is running.
  async function sendContent(content: string, options?: { keepPermissionPrompt?: boolean }) {
    content = content.trim();
    if (!content || !workspaceId || sendMessage.isPending) return;

    // A turn is opening, so the last one's end is no longer the state of anything. Before the
    // awaits below: these two are what the permission form reads to tell an allowed write that is
    // still running from one that is over.
    setTurnEndedAt(null);
    if (options?.keepPermissionPrompt) setPermissionAnswered(true);

    let conversationId = selectedId;
    if (!conversationId) {
      const conversation = await createConversation.mutateAsync(workspaceId);
      conversationId = conversation.id;
      setActiveId(conversationId);
    }

    setDraft("");
    setPendingQuestions(null);
    if (!options?.keepPermissionPrompt) clearPluginCards();
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
          <CardTitle className="text-base">{t("conversations")}</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handleCreateConversation()}
            disabled={!workspaceId || createConversation.isPending}
          >
            {t("new")}
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 overflow-y-auto p-2">
          {conversationsQuery.isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">{t("loadingConversations")}</p>
          ) : conversationsQuery.isError ? (
            <p className="p-3 text-sm text-destructive">{t("loadConversationsFailed")}</p>
          ) : conversations.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {t("emptyConversations")}
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
            {conversationQuery.data?.title ?? t("defaultTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {conversationQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("loadingMessages")}</p>
            ) : conversationQuery.isError ? (
              <p className="text-sm text-destructive">{t("loadMessagesFailed")}</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("emptyMessages")}
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
                    <p className="mt-1 text-xs text-destructive">{t("messageFailed")}</p>
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
          </div>

          {/* Above the composer, not in the thread: it is a thing to act on, and in the thread it
              scrolled away behind the answer that followed it. */}
          {pendingPermission ? (
            <AssistantPermissionPrompt
              prompt={pendingPermission}
              plugins={assistantPlugins}
              busy={connectPlugin.isPending}
              answered={permissionAnswered}
              turnEndedAt={turnEndedAt}
              // The slot is NOT cleared on an answer: the form stays, showing the write running.
              onAnswer={(answer) => void sendContent(answer, { keepPermissionPrompt: true })}
              onConnect={(pluginKey) => void handlePluginConnectionAction(pluginKey)}
              onDismiss={clearPluginCards}
              className="rounded-lg border border-border"
            />
          ) : null}

          <form className="flex gap-2 border-t pt-4" onSubmit={handleSubmit}>
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("inputPlaceholder")}
              disabled={!workspaceId || sendMessage.isPending}
              maxLength={4000}
            />
            <Button
              type="submit"
              disabled={!draft.trim() || !workspaceId || sendMessage.isPending}
            >
              {sendMessage.isPending ? t("sending") : t("send")}
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
