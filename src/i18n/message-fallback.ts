/**
 * Missing-message handling shared by the server request config
 * (`src/i18n/request.ts`) and the client provider
 * (`src/i18n/intl-client-provider.tsx`).
 *
 * Two layers:
 * 1. `mergeWithFallback` lays the active locale's catalog over the English one,
 *    so a key that exists in en but was forgotten in vi/ja renders the English
 *    message instead of the raw key path.
 * 2. `getMessageFallback` covers a key missing from en as well (a developer
 *    bug the catalog test should have caught): it renders the key's last
 *    segment, humanised, never the full dotted path.
 *
 * Kept free of server-only imports so the client wrapper can use it too, and
 * free of runtime imports so `src/i18n/__tests__` can run it under plain node.
 */
import type { IntlError } from "next-intl";

export type Messages = { [key: string]: string | Messages };

function isTree(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep-merges `override` onto `base`; `override` wins wherever it has a value. */
export function mergeWithFallback(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key];
    result[key] = isTree(value) && isTree(baseValue) ? mergeWithFallback(baseValue, value) : value;
  }
  return result;
}

/** "adminNav.items.billingLedger" -> "Billing ledger". */
export function getMessageFallback({
  namespace,
  key,
}: {
  namespace?: string;
  key: string;
  error?: IntlError;
}): string {
  const path = [namespace, key].filter(Boolean).join(".");
  const last = path.split(".").pop() ?? "";
  const words = last
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

/**
 * A missing message is already handled by the fallback above, so it is only
 * worth a warning in development; anything else (bad ICU syntax, bad args) is
 * a real bug and is always logged. Never throws — a translation problem must
 * not take a page down.
 */
export function onIntlError(error: IntlError): void {
  // Compared as a string (IntlErrorCode.MISSING_MESSAGE) so this file stays a type-only import of
  // next-intl and runs under the node contract tests.
  if (error.code === "MISSING_MESSAGE") {
    if (process.env.NODE_ENV !== "production") console.warn(error.message);
    return;
  }
  console.error(error);
}
