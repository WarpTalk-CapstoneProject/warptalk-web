import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { chatSenderName, isAssistantMessage } from "@/lib/meeting/chat-sender";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
  useMeetingChat,
  useSendMeetingChat,
  useSendMeetingChatFile,
  useTranslateMeetingChat,
} from "@/hooks/use-meeting";
import { useScrollToLatest } from "@/hooks/use-scroll-to-latest";
import { ScrollToLatestChip } from "@/components/ui/scroll-to-latest";
import { AssistantWorkTrail } from "@/components/assistant/assistant-work-trail";
import { ParticipantAvatar } from "@/components/rooms/live/participant-avatar";
import { useMeetingIdentity } from "@/components/rooms/live/meeting-identity-context";
import { ChatMessageDto, ChatMentionDto } from "@/types/realtime";
import type { ChatFileMessageDto } from "@/types/meeting-chat-file";
import { getLanguageName } from "@/lib/language/languages";
import { downloadAuthenticatedFile } from "@/lib/ui/download-artifact";
import { API } from "@/lib/api/endpoints";
import { getErrorMessage } from "@/lib/api/errors";
import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount } from "@tiptap/extensions";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { AssistantMarkdown } from "@/components/assistant/assistant-markdown";
import { AnswerSources } from "@/components/assistant/answer-sources";
import { parseAnswerSources } from "@/lib/assistant/answer-sources";
import { setMentionMenusVisible, suggestion } from "./mentions";
import { SuggestionPluginKey } from "@tiptap/suggestion";
import { mentionMatches, mentionMenuHandlesKey } from "@/lib/meeting/mention-menu";
import {
  CHAT_MESSAGE_COUNTER_THRESHOLD,
  MAX_CHAT_MESSAGE_LENGTH,
} from "@/constants/chat";
import {
  LoaderCircle,
  Send,
  Languages,
  Paperclip,
  FileText,
  FileImage,
  FileArchive,
  Download,
} from "lucide-react";
import { Lumidot } from "lumidot";
import { useTheme } from "next-themes";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface MessageTranslationState {
  text?: string;
  targetLanguage?: string;
  loading: boolean;
  visible: boolean;
  error?: string;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Distance from the bottom, in px, still counted as "reading the newest message". */
const STICK_TO_BOTTOM_PX = 80;

/**
 * Where each room's chat reader was, kept outside the component because the component does
 * not survive a tab switch: MeetingSidePanel renders ChatPanel only while the Chat tab is
 * selected, so Transcript/People -> Chat is a fresh mount with the container at zero.
 *
 * Same treatment TranscriptPanel already got for the same report — see the note there.
 */
const chatScrollOffsets = new Map<string, { offset: number; atBottom: boolean }>();

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ contentType }: { contentType?: string }) {
  if (contentType?.startsWith("image/"))
    return <FileImage className="h-4 w-4" />;
  if (contentType === "application/zip" || contentType?.includes("compressed"))
    return <FileArchive className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

/**
 * The face beside a chat message.
 *
 * A hook cannot be called inside the message loop, so the lookup lives in its own component —
 * one per row, which is what a list of messages is anyway.
 *
 * The identity comes from the meeting's own join (roster + workspace members), never from the
 * message: a chat row carries a sender id and a display name and no picture, and the participants
 * API carries no picture either.
 */
function ChatSenderAvatar({
  userId,
  displayName,
}: {
  userId?: string | null;
  displayName: string;
}) {
  const identity = useMeetingIdentity(userId, displayName);
  // No flag: the row already prints the message's language beside the name.
  return <ParticipantAvatar identity={identity} size="sm" showFlag={false} className="mt-0.5" />;
}

export function ChatPanel({
  roomId,
  sourceLanguage = "en",
  targetLanguage,
  active = true,
}: {
  roomId: string;
  sourceLanguage?: string;
  /** Viewer's own listen language — messages are translated on-click into this. */
  targetLanguage?: string;
  /**
   * Whether Chat is the tab currently on screen.
   *
   * The panel stays mounted when it is not, which is what keeps the half-typed message and the
   * opened translations alive across a tab switch. Everything it draws inside its own box is
   * hidden with it — but the @ menu is appended to document.body by tippy, so it is not, and
   * has to be put away by hand.
   */
  active?: boolean;
}) {
  const messages = useTranslationRoomStore((state) => state.chatMessages);
  // Only so a document chip under a WarpBot answer can link to that document; a room whose
  // workspace is not in the store simply renders the chip as a label.
  const activeWorkspaceSlug = useWorkspaceStore(
    (state) => state.activeWorkspaceSlug,
  );
  const participants = useTranslationRoomStore((state) => state.participants);
  const assistantState = useTranslationRoomStore((state) => state.assistantState);
  const assistantSteps = useTranslationRoomStore((state) => state.assistantSteps);
  const assistantTrails = useTranslationRoomStore((state) => state.assistantTrails);
  const sealAssistantTrail = useTranslationRoomStore((state) => state.sealAssistantTrail);
  const assistantStartedAt = useTranslationRoomStore((state) => state.assistantStartedAt);
  const assistantFinishedAt = useTranslationRoomStore((state) => state.assistantFinishedAt);
  const assistantActivityAt = useTranslationRoomStore((state) => state.assistantActivityAt);
  const setAssistantState = useTranslationRoomStore((state) => state.setAssistantState);
  const answersWhenAskedRef = useRef(0);
  const setChatMessages = useTranslationRoomStore(
    (state) => state.setChatMessages,
  );
  const addChatMessage = useTranslationRoomStore(
    (state) => state.addChatMessage,
  );
  const user = useAuthStore((state) => state.user);
  const historyQuery = useMeetingChat(roomId);
  const { mutate: sendMessageAPI, isPending } = useSendMeetingChat();
  const { mutate: sendFileAPI, isPending: isUploadingFile } =
    useSendMeetingChatFile();
  const { mutate: translateMessageAPI } = useTranslateMeetingChat(roomId);
  const [sendError, setSendError] = useState<string | null>(null);
  // Tracked in state rather than read from editor.storage during render: useEditor does not
  // re-render on every transaction, so the counter would otherwise lag the typing.
  const [characterCount, setCharacterCount] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [translations, setTranslations] = useState<
    Record<string, MessageTranslationState>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The language a translation is offered IN, taken from the viewer's own listen language.
  //
  // This used to be a dropdown in the panel header — "Translate to [Vietnamese]" — sitting
  // above a thread most people never translate, asking a question before there was anything
  // to ask it about. The per-message button already existed and already knew which language
  // to use; the header was a second way to say the same thing, and the only way to discover
  // the first was to hover a bubble.
  const suggestedTargetLanguage = targetLanguage || "en";
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const hasRestoredRef = useRef(false);
  const previousTargetLanguageRef = useRef(targetLanguage);
  const { resolvedTheme } = useTheme();
  const lumidotVariant = resolvedTheme === "dark" ? "white" : "black";

  function toggleTranslation(messageId: string) {
    const current = translations[messageId];
    if (current?.text) {
      setTranslations((prev) => ({
        ...prev,
        [messageId]: { ...current, visible: !current.visible },
      }));
      return;
    }

    setTranslations((prev) => ({
      ...prev,
      [messageId]: { loading: true, visible: true },
    }));
    translateMessageAPI(
      { messageId, targetLanguage: suggestedTargetLanguage },
      {
        onSuccess: (dto) => {
          setTranslations((prev) => ({
            ...prev,
            [messageId]: {
              text: dto.translatedText,
              targetLanguage: dto.targetLanguage || suggestedTargetLanguage,
              loading: false,
              visible: true,
            },
          }));
        },
        onError: () => {
          setTranslations((prev) => ({
            ...prev,
            [messageId]: {
              loading: false,
              visible: true,
              error: "Could not translate message.",
            },
          }));
        },
      },
    );
  }

  useEffect(() => {
    if (
      !targetLanguage ||
      targetLanguage === previousTargetLanguageRef.current
    ) {
      return;
    }
    previousTargetLanguageRef.current = targetLanguage;
    // Translations already fetched are in the previous language — drop them so a message
    // re-opened after the viewer changes what they listen in re-fetches rather than showing
    // stale text under a new label.
    setTranslations({});
  }, [targetLanguage]);

  useEffect(() => {
    if (historyQuery.data) {
      setChatMessages(historyQuery.data);
    }
  }, [historyQuery.data, setChatMessages]);

  // A NEW answer has landed — stop waiting, whichever way it arrived.
  //
  // Counted, not merely present: a second question in a room that already holds WarpBot
  // replies would otherwise clear the indicator the instant it appeared. The baseline is
  // taken when the question is asked, so what this watches for is one MORE answer than
  // existed then.
  //
  // Both delivery paths are covered: the live broadcast, and a history backfill after a hub
  // reconnect — which is how the answer arrives when the socket was down while WarpBot
  // replied.
  useEffect(() => {
    if (assistantState === "idle") return;
    const answers = messages.filter(isAssistantMessage);
    if (answers.length > answersWhenAskedRef.current) {
      // The trail belongs to the answer, not to the panel. Sealed here because this is the one
      // place that knows WHICH message the turn just produced — the newest one — and the widget
      // has kept a folded trail under every past reply since it shipped.
      const newest = answers[answers.length - 1];
      if (newest) sealAssistantTrail(newest.id);
      setAssistantState("idle");
    }
    // NOT `assistantState !== "thinking"`. That guard is the reported bug: once the wait had been
    // declared over, the answer arriving could no longer clear the notice, so a slow reply left a
    // permanent "WarpBot didn't answer" sitting above a WarpBot answer.
  }, [messages, assistantState, setAssistantState, sealAssistantTrail]);

  // One deadline, wherever "thinking" came from — the optimistic set on send, or the
  // server's pending signal. A spinner with no end is its own lie, and this one would
  // otherwise outlive the meeting.
  useEffect(() => {
    if (assistantState !== "thinking") return;
    const timer = window.setTimeout(() => {
      if (useTranslationRoomStore.getState().assistantState === "thinking") {
        // "slow", not "timed out". The old state declared WarpBot had failed on nothing but a
        // clock, while a tool-calling loop was still running — and it was usually wrong, because
        // the answer then arrived. Saying it is taking a while claims neither failure nor
        // success, and the answer clears it either way.
        useTranslationRoomStore.getState().setAssistantState("slow");
      }
    }, 90_000);
    return () => window.clearTimeout(timer);
    // Re-armed on every sign of life. Keyed on the question alone, a model that merely thought
    // for longer than the window was declared dead while it was working.
  }, [assistantState, assistantActivityAt]);

  // WHERE THE READER WAS, NOT A REPLAY OF THE WHOLE THREAD.
  //
  // Switching to Transcript or People unmounts this panel, so coming back mounts it again
  // with the container at scrollTop 0 - and `scroll-smooth` on the container turned the
  // catch-up assignment into an animation down the entire conversation, every single time
  // the tab was re-opened. Ending at the newest message was right; getting there by gliding
  // past every message that came before it was not.
  //
  // The restore is now a jump, and it goes back to the offset this room was left at rather
  // than always to the end, so someone who had scrolled up to read something finds it still
  // on screen. New messages still glide in, but only for a reader already at the bottom.
  useEffect(() => {
    const container = containerRef.current;
    // Nothing to restore against while the history request is still in flight: restoring now
    // would mark the panel restored and leave the real arrival to animate.
    if (!container || messages.length === 0) return;

    /** Move without animating - `scroll-smooth` is for new messages, not for restoring. */
    function jumpTo(top: number) {
      const previous = container!.style.scrollBehavior;
      container!.style.scrollBehavior = "auto";
      container!.scrollTop = top;
      container!.style.scrollBehavior = previous;
    }

    if (!hasRestoredRef.current) {
      hasRestoredRef.current = true;
      const remembered = chatScrollOffsets.get(roomId);
      // Anyone who was at the bottom stays at the bottom, including a first visit: the newest
      // message is what an open chat panel is for.
      jumpTo(
        remembered && !remembered.atBottom
          ? remembered.offset
          : container.scrollHeight,
      );
      shouldAutoScrollRef.current = remembered ? remembered.atBottom : true;
      return;
    }

    if (shouldAutoScrollRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, roomId]);

  const { isAway, scrollToLatest } = useScrollToLatest(containerRef, {
    // The same slack handleMessagesScroll uses to decide the panel is still following.
    threshold: STICK_TO_BOTTOM_PX,
    revision: messages.length,
  });

  function handleMessagesScroll() {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < STICK_TO_BOTTOM_PX;
    chatScrollOffsets.set(roomId, {
      offset: container.scrollTop,
      atBottom: shouldAutoScrollRef.current,
    });
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        // Short on purpose. This panel is a narrow column, and "Type a message or @agent for
        // AI help..." wrapped onto a second line inside a one-line box. The @ hint does not
        // need to live here: typing "@" opens the agent menu, which names WarpBot itself.
        placeholder: "Type a message…",
      }),
      // Stops the typing at the cap rather than letting the message be composed and then
      // rejected by the API (WT-237).
      CharacterCount.configure({ limit: MAX_CHAT_MESSAGE_LENGTH }),
      Mention.configure({
        HTMLAttributes: {
          class:
            "text-primary font-medium bg-primary/10 rounded px-1",
        },
        suggestion,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[36px] max-h-[120px] overflow-y-auto custom-scrollbar w-full bg-transparent text-[13px] text-ink outline-none px-3 py-2",
      },
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        // Hand Enter and Tab back to the @ menu while it is offering something.
        //
        // ProseMirror checks these direct props BEFORE any plugin, so this handler used to
        // beat the mention menu outright: you typed "@", saw "@WarpBot AGENT" highlighted,
        // pressed Enter, and sent the literal text "@" instead of picking what was on screen.
        const mention = SuggestionPluginKey.getState(view.state) as
          | { active?: boolean; query?: string }
          | undefined;
        if (
          mention?.active &&
          mentionMenuHandlesKey(event.key, mentionMatches(mention.query ?? "").length)
        ) {
          return false;
        }

        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
          return true;
        }
        return false;
      },
    },
    content: "",
    onUpdate: ({ editor: updatedEditor }) => {
      setCharacterCount(updatedEditor.storage.characterCount.characters());
    },
  });

  function sendMessage() {
    if (!editor) return;

    // Extract plain text and mentions
    const json = editor.getJSON();
    let textContent = "";
    const mentions: ChatMentionDto[] = [];

    // A simple recursive function to extract text and mentions
    const parseNode = (node: JSONContent) => {
      if (node.type === "text") {
        textContent += node.text;
      } else if (node.type === "mention") {
        const id = String(node.attrs?.id ?? "");
        const label = String(node.attrs?.label ?? "");
        textContent += `@${label}`;
        mentions.push({
          id,
          display: label,
          type: "agent",
        });
      } else if (node.type === "hardBreak") {
        textContent += "\n";
      }

      if (node.content) {
        node.content.forEach(parseNode);
      }
    };

    if (json.content) {
      json.content.forEach((block) => {
        parseNode(block);
        textContent += "\n";
      });
    }

    const trimmedText = textContent.trim();
    if (!trimmedText) return;

    // The editor caps its own document, but mentions expand to "@label" on the way out, so
    // the text actually sent can be longer than what was typed.
    if (trimmedText.length > MAX_CHAT_MESSAGE_LENGTH) {
      setSendError(
        `Message is too long (${trimmedText.length}/${MAX_CHAT_MESSAGE_LENGTH} characters).`,
      );
      return;
    }

    setSendError(null);

    // BEFORE the request, not in onSuccess.
    //
    // onSuccess runs after the HTTP round trip, and WarpBot's answer arrives over SignalR
    // independently — so a fast answer landed FIRST, cleared a state that was still idle, and
    // then onSuccess switched "thinking" on with nothing left to turn it off. Ninety seconds
    // later the user saw "WarpBot didn't answer" sitting underneath the answer.
    const asksTheAgent = mentions.some((mention) => mention.type === "agent");
    if (asksTheAgent) {
      // How many answers existed at the moment of asking. Captured here, synchronously,
      // rather than in an effect: an effect runs after the render, by which time a fast
      // answer may already have arrived and would be counted as part of the baseline — which
      // is a spinner that never stops.
      answersWhenAskedRef.current = messages.filter(isAssistantMessage).length;
      setAssistantState("thinking");
    }

    sendMessageAPI(
      {
        roomId,
        data: {
          originalText: trimmedText,
          originalLanguage: sourceLanguage,
          translationEnabled: true,
          mentions: mentions.length > 0 ? mentions : undefined,
        },
      },
      {
        onSuccess: (message) => {
          addChatMessage(message);
          editor.commands.clearContent(true);
        },
        onError: (error) => {
          // WT-365: "Try again." was advice that could not work. A 403 here means the server is
          // REFUSING the message — the room no longer counts this client as an active
          // participant — and retrying refuses it again, forever. The backend now sends its
          // reason with the 403 (see MeetingChatController.ForbiddenWithReason), so say that;
          // the generic line stays for the faults where trying again genuinely is the answer.
          setSendError(getErrorMessage(error, "Message could not be sent. Try again."));
          // Nothing was asked, so nothing is pending. Leaving this would spin for ninety
          // seconds and then blame WarpBot for a message that never reached it.
          if (asksTheAgent) {
            setAssistantState("idle");
          }
        },
      },
    );
  }

  useEffect(() => {
    setMentionMenusVisible(active);
  }, [active]);

  function handleFileButtonClick() {
    fileInputRef.current?.click();
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError("File exceeds the 25 MB limit.");
      return;
    }

    setFileError(null);
    setUploadProgress(0);
    sendFileAPI(
      { roomId, file, onUploadProgress: setUploadProgress },
      {
        onSuccess: (message) => {
          addChatMessage(message);
          setUploadProgress(null);
        },
        onError: () => {
          setFileError("File could not be uploaded. Try again.");
          setUploadProgress(null);
        },
      },
    );
  }

  async function handleFileDownload(file: ChatFileMessageDto) {
    setFileError(null);
    try {
      await downloadAuthenticatedFile(
        API.meetings.chatDownload(roomId, file.id),
        file.fileName || file.originalText || "download",
      );
    } catch {
      setFileError("File could not be downloaded. Try again.");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onScroll={handleMessagesScroll}
        className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar scroll-smooth"
      >
        {historyQuery.isLoading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-ink-subtle">
            <Lumidot variant={lumidotVariant} pattern="frame" glow={4} />
            <span className="ml-2">Loading messages</span>
          </div>
        ) : null}
        {historyQuery.isError && messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-[13px] font-medium text-ink">
              Could not load chat history
            </p>
            <button
              type="button"
              onClick={() => void historyQuery.refetch()}
              className="text-[12px] font-medium text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        ) : null}
        {!historyQuery.isLoading &&
        !historyQuery.isError &&
        messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-ink-subtle">
            No messages yet
          </div>
        ) : null}
        <AnimatePresence initial={false}>
          {messages.map((message: ChatMessageDto) => {
            const isAssistant = isAssistantMessage(message);
            const isMine = !isAssistant && message.senderUserId === user?.id;
            const displayName = chatSenderName(message, user, participants);

            return (
              <motion.div
                key={`${message.id}-${message.createdAt}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-3 items-start group ${isMine ? "flex-row-reverse" : ""}`}
              >
                {/* WarpBot keeps its badge — it is not a person and has no face to show. Everyone
                    else gets theirs, from the same identity join the stage and the transcript use;
                    the chat drew two letters in a square and had no path to a picture at all. */}
                {isAssistant ? (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-semibold text-white shadow-sm">
                    {displayName.substring(0, 2).toUpperCase()}
                  </div>
                ) : (
                  <ChatSenderAvatar
                    userId={message.senderUserId}
                    displayName={displayName}
                  />
                )}
                <div
                  className={`flex min-w-0 flex-1 flex-col ${isMine ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`flex items-baseline gap-2 ${isMine ? "flex-row-reverse" : ""}`}
                  >
                    <span className="text-[13px] font-semibold text-ink">
                      {displayName}
                    </span>
                    <span className="text-[11px] font-medium text-ink-subtle">
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {message.messageType !== "file" &&
                    suggestedTargetLanguage.toLowerCase() !==
                      message.originalLanguage.toLowerCase() ? (
                      <button
                        type="button"
                        onClick={() => toggleTranslation(message.id)}
                        aria-label={`Translate into ${getLanguageName(suggestedTargetLanguage)}`}
                        title={`Translate into ${getLanguageName(suggestedTargetLanguage)}`}
                        aria-pressed={Boolean(translations[message.id]?.visible)}
                        // Always visible, not revealed on hover. The header dropdown is gone,
                        // so this is now the only way to translate anything — and a control
                        // that appears only once the pointer is already on it cannot be found
                        // by someone who does not know it is there. It says which language it
                        // will use, which is what the dropdown was really for.
                        className={`flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-surface-2 hover:text-ink ${
                          translations[message.id]?.visible
                            ? "bg-surface-2 text-ink"
                            : "text-ink-subtle"
                        }`}
                      >
                        {translations[message.id]?.loading ? (
                          <LoaderCircle className="h-3 w-3 animate-spin" />
                        ) : (
                          <Languages className="h-3 w-3" />
                        )}
                      </button>
                    ) : null}
                  </div>
                  {message.messageType === "file" ? (
                    <button
                      type="button"
                      onClick={() =>
                        void handleFileDownload(message as ChatFileMessageDto)
                      }
                      className={`mt-0.5 flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-ink hover:bg-surface-3 ${isMine ? "flex-row-reverse text-right" : "text-left"}`}
                    >
                      <FileTypeIcon
                        contentType={
                          (message as ChatFileMessageDto).contentType
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {(message as ChatFileMessageDto).fileName ||
                            message.originalText}
                        </span>
                        {(message as ChatFileMessageDto).fileSizeBytes !=
                        null ? (
                          <span className="block text-[11px] text-ink-subtle">
                            {formatFileSize(
                              (message as ChatFileMessageDto).fileSizeBytes!,
                            )}
                          </span>
                        ) : null}
                      </span>
                      <Download className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                    </button>
                  ) : isAssistant ? (
                    // WarpBot answers in markdown here too, and this rendered the source of
                    // it — "**transcript hiện tại**" reached the reader as those characters.
                    // Left-aligned unconditionally: a bulleted list right-aligned to match a
                    // chat bubble is unreadable, and WarpBot's messages are never "mine".
                    // `text-ink`, the same as the widget. This was `font-medium text-primary`
                    // — violet, bolder than anything else in the panel — so one agent answered
                    // in two different voices depending on which surface you asked from, and
                    // the meeting one read as a system notice rather than as a reply.
                    // Left-aligned unconditionally: a bulleted list right-aligned to match a
                    // chat bubble is unreadable, and WarpBot's messages are never "mine".
                    <div
                      className={`mt-0.5 max-w-full break-words text-left text-[13px] leading-relaxed text-ink`}
                    >
                      <AssistantMarkdown>{message.originalText}</AssistantMarkdown>
                      {/* Under the answer, inside the same left-aligned block: the chips
                          belong to what WarpBot just said, and a row hung off the message
                          container would sit under whoever spoke next. */}
                      <AnswerSources
                        sources={parseAnswerSources(message.sourcesJson)}
                        workspaceSlug={activeWorkspaceSlug}
                      />
                      {/* And under those, the folded trail — the record of which tools this
                          particular answer came through. The widget has shown one under every
                          reply since it shipped; here the only trail was a live one at the
                          bottom of the panel, which belonged to whatever was asked last. */}
                      {assistantTrails[message.id] ? (
                        <AssistantWorkTrail
                          steps={assistantTrails[message.id].steps}
                          running={false}
                          durationMs={assistantTrails[message.id].durationMs}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <p
                      className={`mt-0.5 max-w-full text-[13px] leading-relaxed whitespace-pre-wrap break-words text-ink-muted ${isMine ? "text-right" : "text-left"}`}
                    >
                      {message.originalText}
                    </p>
                  )}
                  {translations[message.id]?.visible &&
                  translations[message.id]?.text ? (
                    <p
                      className={`mt-1 max-w-full rounded-md bg-surface-2 px-2 py-1 text-[13px] leading-relaxed whitespace-pre-wrap break-words text-ink ${isMine ? "text-right" : "text-left"}`}
                    >
                      {translations[message.id]!.text}
                      <span className="ml-1.5 text-[10px] font-medium uppercase text-ink-subtle">
                        {getLanguageName(translations[message.id]?.targetLanguage || suggestedTargetLanguage)}
                      </span>
                    </p>
                  ) : null}
                  {translations[message.id]?.visible &&
                  translations[message.id]?.error ? (
                    <p className="mt-1 text-[12px] text-red-600">
                      {translations[message.id]!.error}
                    </p>
                  ) : null}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* The answer arrives as a WarpBot message in this same shared chat, which everyone
            sees — but a tool-calling loop takes seconds, and with nothing here the wait was
            indistinguishable from having been ignored. */}
        {assistantState !== "idle" && assistantSteps.length === 0 ? (
          <div className="flex items-center gap-2 px-1 py-2 text-[12px] text-ink-muted">
            {/* The same Lumidot the widget uses. Two surfaces run one agent, and three bouncing
                dots here against a Lumidot there said the waiting was a different kind. */}
            <span
              aria-hidden
              className="flex size-[14px] shrink-0 origin-center scale-[0.42] items-center justify-center"
            >
              <Lumidot variant={lumidotVariant} pattern="frame" glow={4} />
            </span>
            <span>
              {assistantState === "slow"
                ? "WarpBot is still working — this one is taking a while."
                : "WarpBot is thinking…"}
            </span>
          </div>
        ) : null}

        {/* The trail, drawn the way the widget draws it: open while it runs, folded into one line
            afterwards. It used to vanish the moment the turn ended, which threw away the only
            record of which tools an answer came through. */}
        {assistantSteps.length > 0 ? (
          <AssistantWorkTrail
            steps={assistantSteps}
            running={assistantState !== "idle"}
            slow={assistantState === "slow"}
            durationMs={
              assistantFinishedAt && assistantStartedAt
                ? assistantFinishedAt - assistantStartedAt
                : null
            }
            className="px-1"
          />
        ) : null}
      </div>
      {/* Reading back through a meeting's chat stops the panel following, which is right — and
          left the newest message somewhere below with nothing on screen saying so. */}
      <ScrollToLatestChip visible={isAway} onClick={scrollToLatest} />
      </div>
      <div className="p-3 bg-transparent">
        {sendError ? (
          <p className="mb-2 text-[12px] text-red-600">{sendError}</p>
        ) : null}
        {fileError ? (
          <p className="mb-2 text-[12px] text-red-600">{fileError}</p>
        ) : null}
        {uploadProgress != null ? (
          <p className="mb-2 text-[12px] text-ink-subtle">
            Uploading file… {uploadProgress}%
          </p>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelected}
        />
        {/* The placeholder is a floated pseudo-element with `h-0`, so it adds no height to the
            line it sits on — which means a placeholder long enough to wrap put its second line
            outside the box and the editor clipped it. It is now held to one line and
            ellipsised, so no future wording can break the composer's shape. */}
        <div className="flex items-end gap-2 rounded-md border border-border bg-surface-1 p-1 transition-colors focus-within:border-primary focus-within:shadow-sm [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-ink-subtle [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:max-w-full [&_.ProseMirror_p.is-editor-empty:first-child::before]:overflow-hidden [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-ellipsis [&_.ProseMirror_p.is-editor-empty:first-child::before]:whitespace-nowrap">
          <button
            type="button"
            onClick={handleFileButtonClick}
            disabled={isUploadingFile}
            aria-label="Attach file"
            title="Attach file"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploadingFile ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>
          <EditorContent editor={editor} className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={sendMessage}
            disabled={isPending}
            aria-label="Send message"
            title="Send message"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        {characterCount >= CHAT_MESSAGE_COUNTER_THRESHOLD ? (
          <p
            className={`mt-1 text-right text-[11px] ${characterCount >= MAX_CHAT_MESSAGE_LENGTH ? "text-red-600" : "text-ink-subtle"}`}
          >
            {characterCount}/{MAX_CHAT_MESSAGE_LENGTH}
          </p>
        ) : null}
      </div>
    </div>
  );
}
