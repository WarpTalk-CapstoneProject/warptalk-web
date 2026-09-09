import axios, { type AxiosError } from "axios";

interface ApiErrorBody {
  error?: string;
  message?: string;
  Message?: string;
  /** The API's own reason: "FORBIDDEN", "NOT_FOUND", "INVALID_STATE", … */
  code?: string;
  /**
   * ASP.NET's ValidationProblemDetails, which is what a FluentValidation failure actually returns
   * — NOT the { error, code } shape the rest of the API uses.
   *
   * `errors` is field name to messages. `title` is always the generic "One or more validation
   * errors occurred.", which is why it is deliberately never shown: swapping one meaningless
   * sentence for another is not a fix.
   */
  title?: string;
  errors?: Record<string, string[]>;
}

/**
 * The messages out of a ValidationProblemDetails, in one sentence.
 *
 * WHY THIS EXISTS
 *     WT-649 reported registration answering a bad Full Name with "Registration failed. Please try
 *     again." The cause was read backwards at first — the API was assumed to be flattening field
 *     names away. It is the opposite. The server sends
 *
 *       { "title": "One or more validation errors occurred.",
 *         "errors": { "FullName": ["Full name cannot exceed 150 characters."] } }
 *
 *     and this client read only `message`, `Message` and `error` — none of which exist on that
 *     shape. So the one response that knew exactly which field was wrong, and why, was the one
 *     response nothing could read, in EVERY feature of the app rather than only on this form.
 *
 *     Confirmed by running it, not by reading it: the { error, code } shape is what a SERVICE
 *     failure returns ("Email already registered"), while a VALIDATOR failure returns
 *     ValidationProblemDetails. Both are 400s from the same endpoint.
 */
function validationMessages(body: ApiErrorBody | undefined): string | undefined {
  if (!body?.errors) return undefined;

  const messages = Object.values(body.errors)
    .flat()
    .filter((message): message is string => typeof message === "string" && message.trim().length > 0);

  return messages.length > 0 ? messages.join(" ") : undefined;
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
 * What a failure that carried no server explanation should say instead.
 *
 * Returns undefined when the status is one the caller's own fallback describes better — a 403 on
 * "Create room" and a 403 on "Remove member" want different sentences, and this function knows
 * neither. It only speaks up for failures that are about the *transport*, where the caller's
 * fallback ("Could not create the room.") is not the honest explanation either.
 */
function transportMessage(error: AxiosError): string | undefined {
  // No response at all: DNS, TLS, offline, connection refused, or a client-side timeout.
  if (!error.response) {
    return error.code === "ECONNABORTED" || error.code === "ETIMEDOUT"
      ? "The server took too long to answer. Check your connection and try again."
      : "Cannot reach the WarpTalk server. Check your connection and try again.";
  }

  switch (error.response.status) {
    // 429 is the correct code for this; 503 is what the gateway's rate limiter actually returns,
    // bodyless, when a client IP exceeds its per-minute budget. Everyone behind one office or
    // venue NAT shares that budget, so this is a message real users hit together.
    case 429:
    case 503:
      return "Too many requests reached the server at once. Wait a few seconds and try again.";
    case 502:
    case 504:
      return "The server is not responding right now. Try again in a moment.";
    case 500:
      return "Something went wrong on the server. Try again, and tell us if it keeps happening.";
    default:
      return undefined;
  }
}

/**
 * What to show a person when a request fails.
 *
 * Three sources, in this order: what the server said, what the transport failure means, and the
 * caller's own fallback. The AxiosError's `message` is deliberately NOT one of them.
 *
 * The API answers a refusal with a body that says why — `{"error": "Target language 'ko' is
 * not allowed by the workspace policy.", "code": "FORBIDDEN"}` — while the AxiosError's own
 * `message` is only ever "Request failed with status code 403". That string used to be the last
 * resort before the fallback, and it reached real users verbatim: the gateway's rate limiter
 * rejects with a bodyless 503, so there was no server message to prefer, and people were shown
 * "Request failed with status code 503" as the entire explanation of what had gone wrong. It
 * names an internal number, suggests no action, and is indistinguishable from the product being
 * broken. Nothing a person reads should ever be an axios string.
 */
/**
 * The server's own reason for a failure, or the HTTP status when it gave none.
 *
 * A caller that needs to BEHAVE differently per failure needs this rather than the message: a
 * sentence is for a person, and matching on one is how a copy edit silently changes control
 * flow. `FORBIDDEN` is the case this was added for — the transcript panel rendered "you may not
 * read this" as "this does not exist" because a refusal was indistinguishable from any other
 * empty result (WT-516).
 *
 * Returns undefined when the value is not a failed request at all, so an absent code and a
 * successful call are the same thing to the caller.
 */
export function apiErrorCode(error: unknown): string | number | undefined {
  if (!error) return undefined;
  if (!axios.isAxiosError(error)) return undefined;

  const body = error.response?.data as ApiErrorBody | undefined;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (code.length > 0) return code;

  // The status is a weaker answer than the body's code, and a better one than nothing: a
  // bodyless 403 from a proxy still means refused.
  return error.response?.status;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    return (
      firstMeaningful(
        body?.message,
        body?.Message,
        body?.error,
        validationMessages(body),
        transportMessage(error),
      ) ??
      fallback
    );
  }

  // A non-axios Error's message is the app's own text (a thrown validation message, say), so it
  // is safe to show. Anything that is not an Error at all has nothing readable in it.
  return (error instanceof Error ? firstMeaningful(error.message) : undefined) ?? fallback;
}
