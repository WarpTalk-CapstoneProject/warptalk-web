import { create } from "zustand";
import type {
  AiSuggestionDto,
  ChatMessageDto,
  TranslationRoomStateDto,
  ParticipantInfoDto,
  TranscriptSegmentDto,
  TranslationTextDto,
} from "@/types/realtime";

interface TranslationRoomStoreState {
  // Current live translationRoom state
  translationRoomState: TranslationRoomStateDto | null;
  participants: ParticipantInfoDto[];
  transcriptSegments: TranscriptSegmentDto[];
  // AI suggestions keyed by the segment id they were anchored to. A record rather than a
  // list because at most one suggestion exists per segment and dismissing must be O(1);
  // note the key is a BACKEND segment id, which may have been merged into a bubble with a
  // different id — see findSuggestionForUtterance.
  suggestions: Record<string, AiSuggestionDto>;
  chatMessages: ChatMessageDto[];
  /**
   * Where a WarpBot answer is between being asked for and arriving.
   *
   * The backend broadcasts ChatAssistantResponsePending for exactly this and nothing bound
   * it, so between "@WarpBot ..." and the answer — an OpenAI tool-calling loop, which is
   * seconds, not milliseconds — the chat showed no sign anything was happening. Asking and
   * being ignored look identical when there is nothing in between.
   */
  assistantState: "idle" | "thinking" | "timed_out";
  isMuted: boolean;
  // userIds of OTHER participants with a raised hand — TranslationRoomHub.RaiseHand
  // broadcasts via OthersInGroup, so this never includes the caller's own userId; the
  // caller tracks its own raised state locally instead.
  raisedHands: string[];

  // Actions — called from SignalR event handlers
  setTranslationRoomState: (state: TranslationRoomStateDto) => void;
  setParticipants: (participants: ParticipantInfoDto[]) => void;
  addParticipant: (participant: ParticipantInfoDto) => void;
  removeParticipant: (userId: string) => void;
  updateParticipantMute: (userId: string, isMuted: boolean) => void;
  updateParticipantSpeakLanguage: (userId: string, speakLanguage: string) => void;
  addTranscriptSegment: (segment: TranscriptSegmentDto) => void;
  addOrMergeTranslationText: (translation: TranslationTextDto) => void;
  addSuggestion: (suggestion: AiSuggestionDto, preferredLanguage?: string) => void;
  dismissSuggestion: (segmentId: string) => void;
  setChatMessages: (messages: ChatMessageDto[]) => void;
  addChatMessage: (message: ChatMessageDto) => void;
  setAssistantState: (state: "idle" | "thinking" | "timed_out") => void;
  hideChatMessage: (messageId: string) => void;
  setMuted: (muted: boolean) => void;
  setHandRaised: (userId: string, isRaised: boolean) => void;
  reset: () => void;
}

const initialState = {
  translationRoomState: null,
  participants: [],
  transcriptSegments: [],
  suggestions: {},
  chatMessages: [],
  assistantState: "idle" as const,
  isMuted: false,
  raisedHands: [],
};

export const useTranslationRoomStore = create<TranslationRoomStoreState>()((set) => ({
  ...initialState,

  setTranslationRoomState: (translationRoomState) =>
    set({ translationRoomState, participants: translationRoomState.participants }),

  setParticipants: (participants) => set({ participants }),

  addParticipant: (participant) =>
    set((s) => ({
      participants: [
        ...s.participants.filter((p) => p.userId !== participant.userId),
        participant,
      ],
    })),

  removeParticipant: (userId) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.userId === userId ? { ...p, status: "left" } : p
      ),
    })),

  updateParticipantMute: (userId, isMuted) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.userId === userId ? { ...p, isMuted } : p
      ),
    })),

  updateParticipantSpeakLanguage: (userId, speakLanguage) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.userId === userId ? { ...p, speakLanguage } : p
      ),
    })),

  addTranscriptSegment: (segment) =>
    set((s) => ({
      transcriptSegments: s.transcriptSegments.some((existing) => existing.segmentId === segment.segmentId)
        ? s.transcriptSegments.map((existing) =>
            existing.segmentId === segment.segmentId
              ? {
                  ...segment,
                  translatedText: existing.translatedText || segment.translatedText,
                  targetLanguage: existing.targetLanguage || segment.targetLanguage,
                  // Keep the FIRST arrival. A revision of the same segment (the translation
                  // landing, a corrected transcription) must not shuffle the line's clock
                  // forward to whenever the correction happened.
                  receivedAt: existing.receivedAt ?? segment.receivedAt ?? Date.now(),
                }
              : existing,
          )
        : [...s.transcriptSegments, { ...segment, receivedAt: segment.receivedAt ?? Date.now() }],
    })),

  addOrMergeTranslationText: (translation) =>
    set((s) => {
      // translation.segmentId is its OWN id ("{sourceSegmentId}-{targetLang}-c{idx}"), never
      // equal to the transcript bubble's segmentId — sourceSegmentId is the actual join key
      // back to the TranscriptSegmentReceived bubble it translates. Falling back to
      // translation.segmentId only covers old/unmigrated messages that never carried it.
      const joinKey = translation.sourceSegmentId || translation.segmentId;
      const chunkIndex = translation.chunkIndex ?? 0;
      const existingIndex = s.transcriptSegments.findIndex((segment) => segment.segmentId === joinKey);

      if (existingIndex === -1) {
        return {
          transcriptSegments: [
            ...s.transcriptSegments,
            {
              segmentId: joinKey,
              speakerId: translation.speakerId,
              speakerName: "Speaker",
              originalText: translation.originalText,
              originalLanguage: translation.sourceLang,
              translatedText: translation.translatedText,
              targetLanguage: translation.targetLang,
              confidence: 1,
              startTimeMs: translation.startTimeMs ?? 0,
              endTimeMs: translation.endTimeMs ?? 0,
            },
          ],
        };
      }

      const segment = s.transcriptSegments[existingIndex];
      // One STT segment can be split into multiple translated sentences (chunk_index >
      // 0 for the 2nd+ sentence) — those must be APPENDED, not overwrite the first
      // sentence's translation. chunk_index 0 always replaces (it's either the only
      // sentence, or a fresh segment's first one).
      const translatedText =
        chunkIndex > 0 && segment.targetLanguage === translation.targetLang && segment.translatedText
          ? `${segment.translatedText} ${translation.translatedText}`.trim()
          : translation.translatedText;

      const updated = {
        ...segment,
        originalText: segment.originalText || translation.originalText,
        originalLanguage: segment.originalLanguage || translation.sourceLang,
        translatedText,
        targetLanguage: translation.targetLang,
        startTimeMs: segment.startTimeMs || translation.startTimeMs || 0,
        endTimeMs: translation.endTimeMs || segment.endTimeMs,
      };

      const transcriptSegments = s.transcriptSegments.slice();
      transcriptSegments[existingIndex] = updated;
      return { transcriptSegments };
    }),

  /**
   * AI suggestions are fanned out to the WHOLE room, one per language the room is translating
   * into — the same broadcast shape as TranslationTextReceived, which the transcript handler
   * already filters by the viewer's own language. This did not filter at all, so a viewer set to
   * English read a suggestion written in Vietnamese because another participant was listening in
   * Vietnamese ("e set speak en - hear en mà sao suggest ở vi").
   *
   * PREFERRED, not required. Dropping every non-matching suggestion would be correct only if the
   * worker is guaranteed to emit the viewer's language, and it is not — a room translating into
   * one language would then show nobody any suggestions at all. So a matching language always
   * wins, and a non-matching one is only kept when nothing better has arrived for that segment.
   */
  addSuggestion: (suggestion, preferredLanguage) =>
    set((s) => ({
      suggestions: (() => {
        const existing = s.suggestions[suggestion.segmentId];
        if (!existing) return { ...s.suggestions, [suggestion.segmentId]: suggestion };

        const matches = (candidate: AiSuggestionDto) =>
          Boolean(preferredLanguage) &&
          candidate.language?.slice(0, 2).toLowerCase() ===
            preferredLanguage!.slice(0, 2).toLowerCase();

        // Keep what is already shown unless the newcomer is a better language match.
        if (matches(existing) || !matches(suggestion)) return s.suggestions;
        return { ...s.suggestions, [suggestion.segmentId]: suggestion };
      })(),
    })),

  dismissSuggestion: (segmentId) =>
    set((s) => {
      // Nothing here is persisted, so a dismissal only has to survive until the room is
      // left — deleting the key is enough, and it can never come back: the worker takes a
      // one-shot Redis slot per suggestion and never republishes one.
      if (!(segmentId in s.suggestions)) return s;
      const remaining = { ...s.suggestions };
      delete remaining[segmentId];
      return { suggestions: remaining };
    }),

  setChatMessages: (messages) =>
    set((s) => ({
      chatMessages: mergeChatMessages(s.chatMessages, messages),
    })),

  setAssistantState: (assistantState) => set({ assistantState }),

  addChatMessage: (message) =>
    set((s) => ({
      // Clearing the waiting state is NOT done here. The store is imported by a node test
      // that cannot resolve the "@/" alias for a value import — and more to the point, a
      // message store has no business knowing what an assistant message means. The chat
      // panel watches for the answer instead, in one place, covering both the live broadcast
      // and a history backfill.
      chatMessages: s.chatMessages.some((existing) => existing.id === message.id)
        ? s.chatMessages.map((existing) => (existing.id === message.id ? message : existing))
        : [...s.chatMessages, message],
    })),

  hideChatMessage: (messageId) =>
    set((s) => ({
      chatMessages: s.chatMessages.filter((m) => m.id !== messageId),
    })),

  setMuted: (isMuted) => set({ isMuted }),

  setHandRaised: (userId, isRaised) =>
    set((s) => ({
      raisedHands: isRaised
        ? s.raisedHands.includes(userId)
          ? s.raisedHands
          : [...s.raisedHands, userId]
        : s.raisedHands.filter((id) => id !== userId),
    })),

  reset: () => set(initialState),
}));

function mergeChatMessages(current: ChatMessageDto[], incoming: ChatMessageDto[]) {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messagesById.set(message.id, message));

  return Array.from(messagesById.values()).sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
}
