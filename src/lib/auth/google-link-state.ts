/**
 * What Settings > Connected accounts may offer for Google, derived from GET /auth/me.
 *
 * WHY THIS IS A FUNCTION AND NOT INLINE JSX CONDITIONS
 *   The server has one rule — `UnlinkGoogleAsync` refuses with MIN_AUTH_METHOD_REQUIRED when the
 *   account has no local password — and the page must agree with it before the click, not after.
 *   Offering an Unlink button the server will refuse is how a user finds out, by error toast, that
 *   Google was their only way back in. So the decision lives here, where a test pins it.
 *
 * THE UNKNOWN STATE IS DELIBERATE
 *   `googleLinked` and `hasPassword` were added to the auth service's UserDto alongside this page.
 *   An auth service that predates them omits both, and reading an absent field as `false` would
 *   show a linked account as "Not connected" and offer to link it again. Absent means we do not
 *   know, and the page says so instead of guessing either way.
 */

export interface SignInMethods {
  googleLinked?: boolean | null;
  hasPassword?: boolean | null;
}

export type GoogleLinkState =
  /** The auth service did not report link status. Offer nothing rather than a guess. */
  | { kind: "unknown" }
  | { kind: "not-linked" }
  | { kind: "linked"; canUnlink: true }
  | { kind: "linked"; canUnlink: false; reason: string };

export const UNLINK_NEEDS_PASSWORD_REASON =
  "Google is the only way you sign in. Set a password first (use Forgot password on the sign-in page), then you can unlink Google.";

/** Optional translator, defaulted to English so the node:test contract for this file (and any
 * caller that has not been migrated to next-intl) keeps working unchanged. */
export type GoogleLinkReasonTranslator = () => string;

function defaultReasonT(): string {
  return UNLINK_NEEDS_PASSWORD_REASON;
}

export function googleLinkState(
  methods: SignInMethods | null | undefined,
  t: GoogleLinkReasonTranslator = defaultReasonT,
): GoogleLinkState {
  if (!methods || typeof methods.googleLinked !== "boolean") return { kind: "unknown" };
  if (!methods.googleLinked) return { kind: "not-linked" };

  // `hasPassword` absent while `googleLinked` is present cannot come from one server version, but
  // if it ever does, refusing the button is the safe side: the server enforces the rule anyway,
  // and a disabled button costs nothing while a lockout costs the account.
  if (methods.hasPassword === true) return { kind: "linked", canUnlink: true };
  return { kind: "linked", canUnlink: false, reason: t() };
}
