/**
 * What a meeting says when translation stops because the workspace cannot pay for it. WT-699 / TC3705.
 *
 * warptalk-ai's billing_worker publishes TranslationCreditsExhausted (with the subscription's
 * suspended_reason) the first time a charge for the room is refused, and translation_worker stops
 * translating the room. Before this, translation kept running at zero credits and nothing on
 * screen said so — and when it did stop, it stopped silently. The sentence names the actual reason,
 * never a guess: an overdue invoice is not "out of credits".
 *
 * Kept free of React so `node:test` can pin it. Mirrors TranslationRoomService.TranslationSuspendedMessage
 * on the backend, which answers a refused Start Translation with the same reasons.
 */

export function translationSuspendedNotice(reason: string | null | undefined): string {
  switch ((reason ?? "").trim().toLowerCase()) {
    case "overage_cap":
    case "insufficient_credits":
      return "Translation stopped: this workspace has run out of credits. Ask a workspace owner to add credits or upgrade the plan.";
    case "invoice_overdue":
      return "Translation stopped: this workspace has an overdue invoice. Ask a workspace owner to settle it.";
    case "trial_ended":
      return "Translation stopped: this workspace's trial has ended. Ask a workspace owner to choose a plan.";
    default:
      return "Translation stopped: this workspace's AI service is suspended. Ask a workspace owner to check billing.";
  }
}

export const TRANSLATION_RESTORED_NOTICE =
  "Translation is available again — the workspace's billing was restored.";
