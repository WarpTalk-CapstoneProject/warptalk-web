import axios from "axios";

interface ApiErrorBody {
  error?: string;
  message?: string;
  Message?: string;
}

/**
 * The first candidate that would actually read as something.
 *
 * `??` alone was not enough: a field that is present but empty ("" or whitespace)
 * short-circuits the chain and yields a message that renders as a blank toast — visibly
 * indistinguishable from no error being reported at all (WT-270).
 */
function firstMeaningful(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * What to show a person when a request fails.
 *
 * The API answers a refusal with a body that says why — `{"error": "Target language 'ko' is
 * not allowed by the workspace policy.", "code": "FORBIDDEN"}` — while the AxiosError's own
 * `message` is only ever "Request failed with status code 403". The body is read first for
 * exactly that reason; the axios string is the last resort before the caller's fallback.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    return (
      firstMeaningful(body?.message, body?.Message, body?.error, error.message) ??
      fallback
    );
  }

  return (error instanceof Error ? firstMeaningful(error.message) : undefined) ?? fallback;
}
