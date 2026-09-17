/**
 * WT-701 — the rules the recap rail's summary picker polls by.
 *
 * Choosing a shape or language asks the server for that rendering and polls until it is written.
 * Two things used to end that wait wrongly: the first network blip or gateway 502 reset the
 * picker as if the server had refused, and an answer echoing the pair in the server's normalised
 * spelling was mistaken for a stale reply, which stopped the poll while the selects stayed locked
 * on "generating" forever. Pure and relative-import-only so the node test runner covers it.
 */

import { getErrorStatus } from "../api/retry-policy.ts";

/**
 * Whether a failed rendering read is worth asking again on the next tick.
 *
 * No response at all (network, CORS, a timeout), a 5xx, or a 429 is transient: the poll already
 * waits four seconds between reads and gives up at its own deadline, so asking again is bounded.
 * 429 differs from the general retry policy on purpose — that one retries immediately with
 * backoff, this one simply keeps its slow cadence. Any other 4xx is the server saying no, with a
 * sentence the reader should see now rather than ninety seconds later.
 *
 * Only a request error counts as "no response": an exception thrown by our own code would throw
 * again on every tick, so it ends the attempt like a refusal does.
 */
export function isRetryableRenderingError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === null) {
    return Boolean(
      error
        && typeof error === "object"
        && (error as { isAxiosError?: unknown }).isAxiosError === true,
    );
  }
  return status === 429 || status >= 500;
}

/** The template key as the server spells it: trimmed, lower case. */
export function normalizeRenderingTemplate(templateKey: string | null | undefined): string {
  return (templateKey ?? "").trim().toLowerCase();
}

/** A bare, lower-case language code ("vi-VN" → "vi"); "" stays "" (as spoken). */
export function normalizeRenderingLanguage(language: string | null | undefined): string {
  return (language ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * Whether a rendering answer is the one that was asked for.
 *
 * Compared in the server's normalised spelling, so an echo that differs only in case or region
 * is not read as stale. Asking for "as spoken" ("") names no language, so whatever language the
 * server resolved it to is still that request's answer.
 */
export function renderingAnswerMatches(
  requested: { templateKey: string; language: string },
  answer: { templateKey?: string | null; language?: string | null },
): boolean {
  if (
    normalizeRenderingTemplate(requested.templateKey)
    !== normalizeRenderingTemplate(answer.templateKey)
  ) {
    return false;
  }
  const requestedLanguage = normalizeRenderingLanguage(requested.language);
  if (!requestedLanguage) return true;
  return requestedLanguage === normalizeRenderingLanguage(answer.language);
}
