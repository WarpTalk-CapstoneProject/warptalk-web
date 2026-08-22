import { create } from "zustand";
// Relative, with the extension: session-scoped-state.test.ts imports this store under the plain
// node test runner, which does not resolve the "@/" alias for a real (non-type) import.
import { normalizeLanguageCode } from "../lib/language/languages.ts";
import type {
  AiSuggestionDto,
  ChatMessageDto,
  TranslationRoomStateDto,
  ParticipantInfoDto,
  TranscriptSegmentDto,
  TranslationTextDto,
} from "@/types/realtime";
// Relative, not "@/...": these stores are imported directly by node-run contract tests, which
// have no bundler and cannot resolve the alias. The same trap already cost a fix once
// (normalizeLanguageCode, WT-371).
import type { AssistantStep } from "../lib/meeting/assistant-tool-labels.ts";

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
  assistantState: "idle" | "thinking" | "slow";
  /**
   * When the open turn began and when it ended, so the finished trail can say how long it took
   * rather than only what it did. Both null before the first question of a session.
   */
  assistantStartedAt: number | null;
  assistantFinishedAt: number | null;
  /**
   * Which tool WarpBot reached for last, so the room can see the step rather than a spinner.
   *
   * The backend has always carried the tool name on the result message and threw it away; the
   * global assistant widget has shown it since it shipped.
   */
  /**
   * The tools WarpBot has reached for this turn, in order.
   *
   * A single latest-tool string was overwritten by each new call, so a loop that checked the
   * glossary and then searched documents showed one label for a moment and looked like a
   * spinner. The trail is the evidence somebody asked for: which tools, in what order.
   */
  assistantSteps: AssistantStep[];
  /**
   * When WarpBot last showed a sign of life — a pending signal, a tool call, an answer.
   *
   * The deadline is measured from HERE, not from when the question was asked. Measured from the
   * question, a model that simply thought for longer than the threshold was declared dead while
   * it was still working, and the notice then sat in the chat after the answer arrived. A
   * tool-calling loop emits a step every few seconds, so silence for the whole window is the only
   * thing that can now mean trouble.
   */
  assistantActivityAt: number;
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
  updateParticipantListenLanguage: (userId: string, listenLanguage: string) => void;
  addTranscriptSegment: (segment: TranscriptSegmentDto) => void;
  addOrMergeTranslationText: (translation: TranslationTextDto) => void;
  addSuggestion: (suggestion: AiSuggestionDto, preferredLanguage?: string) => void;
  dismissSuggestion: (segmentId: string) => void;
  setChatMessages: (messages: ChatMessageDto[]) => void;
  addChatMessage: (message: ChatMessageDto) => void;
  setAssistantState: (state: "idle" | "thinking" | "slow") => void;
  /** WarpBot showed a sign of life; optionally names the tool it just reached for. */
  noteAssistantActivity: (toolName?: string | null, toolDetail?: string | null) => void;
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
  assistantStartedAt: null as number | null,
  assistantFinishedAt: null as number | null,
  assistantSteps: [] as AssistantStep[],
  assistantActivityAt: 0,
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

  // The listen half of the pair above, and it was missing — with a consequence bigger than a
  // stale roster row. hasDubAudience() answers "is anyone listening in another language?" from
  // each OTHER participant's listenLanguage, and that sentence is what the Voice panel shows
  // ("Nobody is listening in another language right now, so nothing is being dubbed"). With no
  // live update, a partner switching languages mid-meeting never changed the sentence: in the
  // 16 Aug test both users sat on "nobody is listening" while the mesh had already built their
  // routes, and concluded voice clone was broken.
  updateParticipantListenLanguage: (userId, listenLanguage) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.userId === userId ? { ...p, listenLanguage } : p
      ),
    })),

  addTranscriptSegment: (segment) =>
    set((s) => ({
      transcriptSegments: s.transcriptSegments.some((existing) => existing.segmentId === segment.segmentId)
        ? s.transcriptSegments.map((existing) =>
            existing.segmentId === segment.segmentId
              ? {
                  ...segment,
                  // Translations already filed against this bubble survive a later STT revision
                  // of the same segment. TranscriptSegmentReceived always carries them as null
                  // (AiResultConsumerService builds it that way), so spreading `segment` over an
                  // existing entry would erase every translation the panel is rendering.
                  translations: existing.translations ?? segment.translations,
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

  /**
   * Files a translation under ITS OWN language rather than overwriting the bubble's.
   *
   * WT-371 Bug 4. This used to keep exactly one translation per bubble — `translatedText` plus
   * `targetLanguage`, replaced by whichever payload landed last — and the SignalR handler
   * protected that single slot by dropping every translation whose language was not the
   * viewer's. Two things fall out of that, and the report is both:
   *
   *   • The viewer's listen language is RESOLVED, not known. It comes from the picker, then
   *     session storage, then their participant row (see participant-language-preference), and
   *     the participant row arrives over the network. In the window before it does, the room
   *     default stands in — so on a cold direct navigation to an [en, vi] room the filter
   *     briefly admitted the wrong language, those bubbles kept it forever, and the panel ended
   *     up showing "English → Vietnamese" on one line and "Vietnamese → English" on the next.
   *   • Changing the listen language mid-meeting only affected new lines. Everything already on
   *     screen stayed in the old language, which is the same mixture arrived at from the other
   *     direction.
   *
   * Keyed by normalized language, the bubble no longer has a language of its own — the READER
   * does, and the panel picks the matching entry at render time. A late-resolving or changed
   * listen language re-renders the whole transcript into that language instead of leaving a
   * permanent seam. The handler no longer has to filter to protect a slot, which is what made
   * the race reachable in the first place.
   *
   * Memory is bounded by (segments × languages in the room) short strings; nothing extra crosses
   * the network, since the gateway already fans every language out to the whole room group.
   */
  addOrMergeTranslationText: (translation) =>
    set((s) => {
      // translation.segmentId is its OWN id ("{sourceSegmentId}-{targetLang}-c{idx}"), never
      // equal to the transcript bubble's segmentId — sourceSegmentId is the actual join key
      // back to the TranscriptSegmentReceived bubble it translates. Falling back to
      // translation.segmentId only covers old/unmigrated messages that never carried it.
      const joinKey = translation.sourceSegmentId || translation.segmentId;
      const chunkIndex = translation.chunkIndex ?? 0;
      // Normalized so "en-US" from a picker and "en" from the worker are one key. Unnormalized
      // they are two, and the panel — which looks the reader's language up by key — would miss.
      const language = normalizeLanguageCode(translation.targetLang);
      if (!language) return {};

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
              translations: { [language]: translation.translatedText },
              confidence: 1,
              startTimeMs: translation.startTimeMs ?? 0,
              endTimeMs: translation.endTimeMs ?? 0,
            },
          ],
        };
      }

      const segment = s.transcriptSegments[existingIndex];
      const existingTranslations = segment.translations ?? {};
      // One STT segment can be split into multiple translated sentences (chunk_index > 0 for
      // the 2nd+ sentence) — those must be APPENDED, not overwrite the first sentence's
      // translation. chunk_index 0 always replaces (it's either the only sentence, or a fresh
      // segment's first one). Now scoped to the language being written: sentence 2 of the
      // Vietnamese translation must never be appended to the English one, which is what a
      // single shared slot made possible whenever two languages interleaved.
      const previous = existingTranslations[language];
      const text =
        chunkIndex > 0 && previous
          ? `${previous} ${translation.translatedText}`.trim()
          : translation.translatedText;

      const updated = {
        ...segment,
        originalText: segment.originalText || translation.originalText,
        originalLanguage: segment.originalLanguage || translation.sourceLang,
        translations: { ...existingTranslations, [language]: text },
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

  setAssistantState: (assistantState) =>
    set((state) => ({
      assistantState,
      // Stamped on the way to idle, and only from a turn that was actually running: the room sets
      // idle defensively in several places, and a second stamp would restart the clock on a trail
      // already folded.
      assistantFinishedAt:
        assistantState === "idle" && state.assistantState !== "idle"
          ? Date.now()
          : state.assistantFinishedAt,
    })),
  // One call for "WarpBot did something", so no caller can move the state and forget to reset
  // the deadline it is measured against.
  noteAssistantActivity: (toolName = null, toolDetail = null) =>
    set((state) => {
      // Idle -> thinking is a NEW question, so the previous turn's trail goes with it.
      const starting = state.assistantState === "idle";
      const carried = starting ? [] : state.assistantSteps;
      return {
        assistantState: starting ? "thinking" : state.assistantState,
        assistantStartedAt: starting ? Date.now() : state.assistantStartedAt,
        assistantFinishedAt: starting ? null : state.assistantFinishedAt,
        assistantSteps: toolName
          ? [
              // Anything still running has finished — a second tool cannot start inside the
              // first, and two spinners at once would say otherwise.
              ...carried.map((step) => ({ ...step, done: true })),
              {
                key: `${toolName}-${carried.length}`,
                tool: toolName,
                done: false,
                // What the call is about, straight from the worker. Never derived here: a
                // target this client guessed at would be a claim about what the agent did,
                // made by something that cannot know.
                detail: toolDetail || undefined,
              },
            ]
          : carried,
        assistantActivityAt: Date.now(),
      };
    }),

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
