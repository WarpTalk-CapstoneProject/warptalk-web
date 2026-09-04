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
  /** Open the widget and put this question in its box. */
  askWarpBot: (prompt: string) => void;
  /** Read the pending question and clear it in one step. */
  consumePendingPrompt: () => string | null;
  reset: () => void;
};

export const useAssistantWidgetStore = create<AssistantWidgetState>()((set, get) => ({
  pendingPrompt: null,

  askWarpBot: (prompt) => {
    const trimmed = prompt.trim();
    if (trimmed) set({ pendingPrompt: trimmed });
  },

  consumePendingPrompt: () => {
    const pending = get().pendingPrompt;
    if (pending !== null) set({ pendingPrompt: null });
    return pending;
  },

  reset: () => set({ pendingPrompt: null }),
}));
