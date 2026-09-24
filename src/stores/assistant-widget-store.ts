import { create } from "zustand";

/**
 * A question handed to the WarpBot widget from somewhere else on the page.
 *
 * WHY A STORE AND NOT A PROP
 *     The widget's open state is local to GlobalChatbot, which is mounted once in the app
 *     layout. A transcript bubble in the meeting side panel is many levels away and on a
 *     different branch of the tree; there is no prop path between them and threading one
 *     through every layout in between to carry a string would be worse than the string.
 *
 * WHY A PROMPT RATHER THAN AN "OPEN" FLAG
 *     Opening the widget and leaving the person to retype what they just clicked is most of
 *     the work left undone. The suggestion already knows the term it noticed, so the question
 *     travels with the request and the widget sends it.
 *
 * The prompt is consumed once. A pending question that survived being read would re-ask
 * itself on the next open, which is the shape of bug that makes people stop trusting a widget
 * that opens on its own.
 */
type AssistantWidgetState = {
  pendingPrompt: string | null;
  /**
   * A conversation the widget should open — today, a meeting's WarpBot thread handed over by
   * "Continue in widget" or by WarpBot's own continue_in_widget tool. Consumed once, like the
   * prompt, so a handover cannot reopen itself on the next launch.
   */
  pendingConversationId: string | null;
  /** True while a handover is being created, so a double click or a second event is one handover. */
  handoffInFlight: boolean;
  /** Open the widget and put this question in its box. */
  askWarpBot: (prompt: string) => void;
  /** Read the pending question and clear it in one step. */
  consumePendingPrompt: () => string | null;
  /** Open the widget on this conversation. */
  openConversation: (conversationId: string) => void;
  /** Read the pending conversation and clear it in one step. */
  consumePendingConversation: () => string | null;
  setHandoffInFlight: (inFlight: boolean) => void;
  reset: () => void;
};

export const useAssistantWidgetStore = create<AssistantWidgetState>()((set, get) => ({
  pendingPrompt: null,
  pendingConversationId: null,
  handoffInFlight: false,

  askWarpBot: (prompt) => {
    const trimmed = prompt.trim();
    if (trimmed) set({ pendingPrompt: trimmed });
  },

  consumePendingPrompt: () => {
    const pending = get().pendingPrompt;
    if (pending !== null) set({ pendingPrompt: null });
    return pending;
  },

  openConversation: (conversationId) => {
    const trimmed = conversationId.trim();
    if (trimmed) set({ pendingConversationId: trimmed });
  },

  consumePendingConversation: () => {
    const pending = get().pendingConversationId;
    if (pending !== null) set({ pendingConversationId: null });
    return pending;
  },

  setHandoffInFlight: (inFlight) => set({ handoffInFlight: inFlight }),

  reset: () => set({ pendingPrompt: null, pendingConversationId: null, handoffInFlight: false }),
}));
