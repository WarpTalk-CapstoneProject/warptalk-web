/**
 * What a meeting says when translation stops because the workspace cannot pay for it. WT-699 / TC3705.
 *
 * warptalk-ai's billing_worker publishes TranslationCreditsExhausted (with the subscription's
 * suspended_reason) the first time a charge for the room is refused, and translation_worker stops
 * translating the room. Before this, translation kept running at zero credits and nothing on
 * screen said so — and when it did stop, it stopped silently. The sentence names the actual reason,
 * never a guess: an overdue invoice is not "out of credits".
 *
 * `subscription_expired` is the 2026-09-24 leak: a workspace whose subscription had ended translated
 * a meeting for free, because billing found no subscription to charge and so never refused anything.
 * billing_worker now stops the room with that reason, and it must not read as "out of credits" —
 * the credits are frozen, not gone, and what the owner has to do is renew.
 *
 * Kept free of React so `node:test` can pin it. The copy lives in the `rooms.translationCredits`
 * catalog (en/vi/ja); pass the component's translator and the notice is localized. Without one it
 * answers in English — the catalog's own source text. Mirrors
 * TranslationRoomService.TranslationSuspendedMessage on the backend, which answers a refused Start
 * Translation with the same reasons.
 */

export type TranslationCreditsNoticeKey =
  | "outOfCredits"
  | "invoiceOverdue"
  | "trialEnded"
  | "subscriptionExpired"
  | "suspended"
  | "restored";

/** A translator scoped to the `rooms.translationCredits` namespace, e.g. useTranslations(...). */
export type TranslationCreditsTranslator = (key: TranslationCreditsNoticeKey) => string;

const ENGLISH: Record<TranslationCreditsNoticeKey, string> = {
  outOfCredits:
    "Translation stopped: this workspace has run out of credits. Ask a workspace owner to add credits or upgrade the plan.",
  invoiceOverdue:
    "Translation stopped: this workspace has an overdue invoice. Ask a workspace owner to settle it.",
  trialEnded:
    "Translation stopped: this workspace's trial has ended. Ask a workspace owner to choose a plan.",
  subscriptionExpired:
    "Workspace subscription expired — translation paused. Ask the workspace owner to renew.",
  suspended:
    "Translation stopped: this workspace's AI service is suspended. Ask a workspace owner to check billing.",
  restored: "Translation is available again — the workspace's billing was restored.",
};

/** Which sentence a suspension reason gets. Unknown reasons make no claim about credits. */
export function translationSuspendedNoticeKey(
  reason: string | null | undefined,
): TranslationCreditsNoticeKey {
  switch ((reason ?? "").trim().toLowerCase()) {
    case "overage_cap":
    case "insufficient_credits":
      return "outOfCredits";
    case "invoice_overdue":
      return "invoiceOverdue";
    case "trial_ended":
      return "trialEnded";
    case "subscription_expired":
      return "subscriptionExpired";
    default:
      return "suspended";
  }
}

export function translationSuspendedNotice(
  reason: string | null | undefined,
  translate?: TranslationCreditsTranslator,
): string {
  const key = translationSuspendedNoticeKey(reason);
  return translate ? translate(key) : ENGLISH[key];
}

export function translationRestoredNotice(translate?: TranslationCreditsTranslator): string {
  return translate ? translate("restored") : ENGLISH.restored;
}

export const TRANSLATION_RESTORED_NOTICE = ENGLISH.restored;
