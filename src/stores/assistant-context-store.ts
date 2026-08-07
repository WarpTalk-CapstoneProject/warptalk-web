import { create } from "zustand";
import type { AssistantPageContextDto } from "@/types/assistant";

interface AssistantContextState {
  pageContext: AssistantPageContextDto | null;
  setPageContext: (context: AssistantPageContextDto | null) => void;
  clearPageContext: (pageType: string) => void;
  /**
   * Unconditional counterpart to `clearPageContext`, for the one caller that is not a page
   * unmounting: a change of signed-in account. Whatever page the previous account was on,
   * its context must not be what the assistant answers the next account's first question
   * from.
   */
  clearAllContext: () => void;
}

export const useAssistantContextStore = create<AssistantContextState>((set, get) => ({
  pageContext: null,
  setPageContext: (context) => set({ pageContext: context }),
  // Only clears if the currently-stored context still belongs to the unmounting page —
  // avoids a fast-navigating page's cleanup wiping the next page's freshly-registered context.
  clearPageContext: (pageType) => {
    if (get().pageContext?.pageType === pageType) set({ pageContext: null });
  },
  clearAllContext: () => set({ pageContext: null }),
}));
