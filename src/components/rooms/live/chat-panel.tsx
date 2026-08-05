import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import { useAuthStore } from "@/stores/auth-store";
import {
  useMeetingChat,
  useSendMeetingChat,
  useSendMeetingChatFile,
  useTranslateMeetingChat,
} from "@/hooks/use-meeting";
import { ChatMessageDto, ChatMentionDto } from "@/types/realtime";
import type { ChatFileMessageDto } from "@/types/meeting-chat-file";
import { getLanguageName, languagesInScope } from "@/lib/languages";
import { downloadAuthenticatedFile } from "@/lib/download-artifact";
import { API } from "@/lib/api/endpoints";
import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount } from "@tiptap/extensions";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { suggestion } from "./mentions";
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
  loading: boolean;
  visible: boolean;
  error?: string;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

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

export function ChatPanel({
  roomId,
  sourceLanguage = "en",
  targetLanguage,
}: {
  roomId: string;
  sourceLanguage?: string;
  /** Viewer's own listen language — messages are translated on-click into this. */
  targetLanguage?: string;
}) {
  const messages = useTranslationRoomStore((state) => state.chatMessages);
  const participants = useTranslationRoomStore((state) => state.participants);
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
  // User-facing "translate messages into" choice — defaults to the viewer's own listen
  // language but can be overridden per session via the dropdown, since the viewer may
  // not know (or want) the language it was inferred to.
  const [selectedTargetLanguage, setSelectedTargetLanguage] = useState(
    targetLanguage || "en",
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const previousTargetLanguageRef = useRef(targetLanguage);
  const { resolvedTheme } = useTheme();
  const lumidotVariant = resolvedTheme === "dark" ? "white" : "black";

  function handleTargetLanguageChange(nextLanguage: string) {
    setSelectedTargetLanguage(nextLanguage);
    // Previously fetched translations are for the old target language — drop them so
    // re-opening a message re-fetches under the newly selected language instead of
    // silently showing stale text.
    setTranslations({});
  }

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
      { messageId, targetLanguage: selectedTargetLanguage },
      {
        onSuccess: (dto) => {
          setTranslations((prev) => ({
            ...prev,
            [messageId]: {
              text: dto.translatedText,
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
    setSelectedTargetLanguage(targetLanguage);
    setTranslations({});
  }, [targetLanguage]);

  useEffect(() => {
    if (historyQuery.data) {
      setChatMessages(historyQuery.data);
    }
  }, [historyQuery.data, setChatMessages]);

  useEffect(() => {
    if (containerRef.current && shouldAutoScrollRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  function handleMessagesScroll() {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
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
        placeholder: "Type a message or @agent for AI help...",
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
      handleKeyDown: (_view: EditorView, event: KeyboardEvent) => {
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
        onError: () => {
          setSendError("Message could not be sent. Try again.");
        },
      },
    );
  }

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
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <label
          htmlFor="chat-translate-target"
          className="text-[11px] font-medium text-ink-subtle"
        >
          Translate to
        </label>
        <select
          id="chat-translate-target"
          value={selectedTargetLanguage}
          onChange={(event) => handleTargetLanguageChange(event.target.value)}
          className="rounded-md border border-border bg-surface-1 px-2 py-1 text-[12px] text-ink outline-none focus:border-primary"
        >
          {languagesInScope("chatTarget").map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
            </option>
          ))}
        </select>
      </div>
      <div
        ref={containerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar scroll-smooth"
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
            const isMine = message.senderUserId === user?.id;
            const isAssistant = message.messageType === "assistant";

            let displayName = "";
            if (isMine && user) {
              displayName = user.fullName;
            } else if (isAssistant) {
              displayName = "WarpBot";
            } else {
              const senderParticipant = participants.find(
                (p) =>
                  p.userId === message.senderUserId ||
                  p.displayName === message.senderDisplayName,
              );
              displayName = senderParticipant?.displayName || "User";
            }

            return (
              <motion.div
                key={`${message.id}-${message.createdAt}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-3 items-start group ${isMine ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold shadow-sm ${isAssistant ? "bg-primary text-white" : isMine ? "bg-ink text-white" : "bg-surface-3 text-ink"}`}
                >
                  {displayName.substring(0, 2).toUpperCase()}
                </div>
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
                    selectedTargetLanguage.toLowerCase() !==
                      message.originalLanguage.toLowerCase() ? (
                      <button
                        type="button"
                        onClick={() => toggleTranslation(message.id)}
                        aria-label="Translate message"
                        title="Translate message"
                        className="flex h-5 w-5 items-center justify-center rounded text-ink-subtle opacity-0 transition-opacity hover:bg-surface-2 hover:text-ink group-hover:opacity-100"
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
                  ) : (
                    <p
                      className={`mt-0.5 max-w-full text-[13px] leading-relaxed whitespace-pre-wrap break-words ${isAssistant ? "text-primary font-medium" : "text-ink-muted"} ${isMine ? "text-right" : "text-left"}`}
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
                        {getLanguageName(selectedTargetLanguage)}
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
        <div className="flex items-end gap-2 rounded-md border border-border bg-surface-1 p-1 transition-colors focus-within:border-primary focus-within:shadow-sm [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-ink-subtle [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0">
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
