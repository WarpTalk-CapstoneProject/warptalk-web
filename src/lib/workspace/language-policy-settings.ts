/**
 * The workspace's meeting-language policy, as the settings page edits it. WT-706.
 *
 * THE DEFECT THIS EXISTS TO CLOSE
 *   `allowedTargetLanguages` is a whitelist whose EMPTY value means "no restriction" — every
 *   reader on both ends agrees on that (see `isLanguageAllowedByPolicy`, and the server's own
 *   short-circuit). The settings page, meanwhile, offered nothing but a row of toggle chips. So
 *   an Owner who wanted to tighten the policy — untick, untick, untick — reached zero ticked
 *   languages and thereby OPENED the workspace to every language the platform supports, with no
 *   warning, no confirmation, and a screen that looked maximally restrictive at the moment it
 *   became maximally permissive. Tightening a control to its limit must never be the way to
 *   disable it.
 *
 * THE SHAPE OF THE FIX
 *   "Unrestricted" stops being a value the list can accidentally fall into and becomes a state
 *   the Owner names: one switch, two postures. While restricted, the list is guaranteed non-empty
 *   — unticking the last language is refused and explained rather than obeyed — so the UI cannot
 *   produce the silent empty-means-everything state at all.
 *
 *   The wire keeps its old meaning: an unrestricted workspace still sends `[]`, which is what
 *   every existing reader already treats as "allow all". Only the intent is now explicit,
 *   alongside the list, in the flag named once below.
 *
 * WHY THIS IS A MODULE AND NOT THREE HANDLERS ON THE PAGE
 *   Every rule here is a statement about a value, not about a component: at least one language
 *   while restricted, the default language inside the list while restricted, and the list empty
 *   while unrestricted. Those are the same three rules the server validates, and they are worth
 *   pinning in a test that does not need a DOM to run.
 */

import {
  getLanguageByCode,
  languagesInScope,
  normalizeLanguageCode,
  normalizeLanguagePolicy,
  type SupportedLanguage,
} from "../language/languages.ts";

/**
 * The name the restriction flag travels under, spelled ONCE.
 *
 * The web half of WT-706 was written beside the backend half rather than after it, so this is
 * the single line to change if the server settles on a different spelling. `WorkspaceSettingsDto`
 * takes the property from the mapped type below rather than re-declaring it, and the settings
 * form builds both its field and its patch from this constant, so nothing else spells it out.
 */
export const RESTRICT_TARGET_LANGUAGES_FIELD = "restrictLanguages" as const;

/**
 * The flag as it appears on the settings document. Optional on purpose: a server that has not
 * shipped its half yet simply omits it, and `readLanguagePolicy` falls back to inferring the
 * posture from the list — a workspace with languages listed is restricted, one without is not,
 * which is precisely what the list has always meant.
 */
export type LanguageRestrictionFlag = {
  [Key in typeof RESTRICT_TARGET_LANGUAGES_FIELD]?: boolean | null;
};

/** The policy as the form holds it: bare ISO-639-1 codes, deduped, in the Owner's own order. */
export type LanguagePolicyState = {
  /** False ⇒ every meeting-scope language is available and `allowed` is empty. */
  restricted: boolean;
  allowed: string[];
  defaultLanguage: string;
};

/**
 * Why a change was refused. A block means the state did NOT move, so the control must stay where
 * it was and say this instead of pretending.
 */
export type LanguagePolicyBlock =
  /** Unticking the last permitted language. The way to permit everything is the switch. */
  | "lastLanguage";

/** Something the change corrected on the Owner's behalf, which they are owed an explanation of. */
export type LanguagePolicyNotice =
  /** Turning restriction ON with nothing ticked seeded the list from the default language. */
  | "seededFromDefault"
  /** The removed language was the workspace default, so the default moved with it. */
  | "defaultLanguageMoved";

export type LanguagePolicyChange = {
  /** The state to apply. Identical to the input when `blocked` is set. */
  next: LanguagePolicyState;
  /** True when `next` differs from the input and is worth saving. */
  changed: boolean;
  blocked: LanguagePolicyBlock | null;
  notice: LanguagePolicyNotice | null;
  /**
   * The language a notice is about, as a bare code: what the default moved AWAY from for
   * `defaultLanguageMoved`, what seeded the list for `seededFromDefault`. The caller turns it
   * into a name — this module holds no display text.
   */
  noticeLanguage: string | null;
};

/** Meeting-scope languages, which is the set this control has always offered. */
export function meetingScopeLanguages(): SupportedLanguage[] {
  return languagesInScope("meeting");
}

/**
 * The settings document's language policy, normalized.
 *
 * Reads the flag when the server sends one and infers it from the list when it does not, so this
 * page behaves correctly against a server on either side of WT-706 — which also means the
 * inference, not a default of `false`, is what an older document gets: a workspace that already
 * has three languages listed IS restricted today and must not be shown as "allow all".
 */
export function readLanguagePolicy(
  settings: {
    defaultLanguage?: string | null;
    allowedTargetLanguages?: string[] | null;
  } & LanguageRestrictionFlag,
): LanguagePolicyState {
  const allowed = normalizeLanguagePolicy(settings.allowedTargetLanguages);
  const flag = settings[RESTRICT_TARGET_LANGUAGES_FIELD];
  const restricted = typeof flag === "boolean" ? flag : allowed.length > 0;

  return {
    restricted,
    // A restriction flag set with nothing listed is the state this ticket forbids; it can only
    // reach us from data written before the rule existed. Reported as unrestricted rather than
    // as "no language permitted", because that is how every reader downstream already treats an
    // empty list, and inventing a stricter reading here would lock rooms that work today.
    allowed: restricted ? allowed : [],
    defaultLanguage: normalizeLanguageCode(settings.defaultLanguage ?? "") || "",
  };
}

/**
 * What to send for a policy state. The list is emptied when unrestricted — the flag alone is not
 * what the rest of the system reads, and leaving a stale list behind it would restrict meetings
 * on any reader that predates the flag.
 */
export function toLanguagePolicyPatch(state: LanguagePolicyState): {
  allowedTargetLanguages: string[];
} & LanguageRestrictionFlag {
  return {
    [RESTRICT_TARGET_LANGUAGES_FIELD]: state.restricted,
    allowedTargetLanguages: state.restricted ? [...state.allowed] : [],
  };
}

function unchanged(state: LanguagePolicyState, blocked: LanguagePolicyBlock): LanguagePolicyChange {
  return { next: state, changed: false, blocked, notice: null, noticeLanguage: null };
}

/**
 * Flip between "allow all languages" and a restricted list.
 *
 * Turning restriction ON never yields an empty list: it seeds from the workspace's default
 * language, which is the one language the workspace has already said it uses. Seeding matters
 * more than it looks — an empty restricted list is exactly the state that reads as "allow all"
 * to every consumer, so a switch that produced one would announce a restriction and apply none.
 */
export function setLanguageRestriction(
  state: LanguagePolicyState,
  restricted: boolean,
): LanguagePolicyChange {
  if (restricted === state.restricted) {
    return { next: state, changed: false, blocked: null, notice: null, noticeLanguage: null };
  }

  if (!restricted) {
    return {
      next: { ...state, restricted: false, allowed: [] },
      changed: true,
      blocked: null,
      notice: null,
      noticeLanguage: null,
    };
  }

  if (state.allowed.length > 0) {
    return {
      next: { ...state, restricted: true },
      changed: true,
      blocked: null,
      notice: null,
      noticeLanguage: null,
    };
  }

  const scope = meetingScopeLanguages();
  // The default language is preferred, but it is not guaranteed to be meeting-scope (nothing
  // stops a workspace defaulting to a language this control never offered), so the scope's own
  // first entry stands in. The registry is a static non-empty table, so `seed` is never empty.
  const seedCode = scope.some((language) => language.code === state.defaultLanguage)
    ? state.defaultLanguage
    : (scope[0]?.code ?? "");
  const seed = seedCode ? [seedCode] : [];

  return {
    next: { ...state, restricted: true, allowed: seed },
    changed: true,
    blocked: null,
    notice: "seededFromDefault",
    noticeLanguage: seedCode || null,
  };
}

/**
 * Tick or untick one language in the restricted list.
 *
 * Unticking the last one is REFUSED rather than silently reinterpreted. Flipping the switch on
 * the Owner's behalf was the alternative considered and rejected: the two states differ by the
 * whole of the policy, and a control that quietly opens a workspace to every language because a
 * checkbox reached zero is the defect this ticket is about, not a gentler version of it.
 */
export function toggleAllowedLanguage(
  state: LanguagePolicyState,
  value: string,
): LanguagePolicyChange {
  const code = normalizeLanguageCode(value);
  // The list is only editable while restricted; the page does not render it otherwise. A call
  // that arrives anyway is a caller bug, not a policy decision, so nothing moves.
  if (!code || !state.restricted) {
    return { next: state, changed: false, blocked: null, notice: null, noticeLanguage: null };
  }

  if (!state.allowed.includes(code)) {
    return {
      next: { ...state, allowed: [...state.allowed, code] },
      changed: true,
      blocked: null,
      notice: null,
      noticeLanguage: null,
    };
  }

  if (state.allowed.length === 1) return unchanged(state, "lastLanguage");

  const allowed = state.allowed.filter((entry) => entry !== code);
  if (state.defaultLanguage !== code) {
    return {
      next: { ...state, allowed },
      changed: true,
      blocked: null,
      notice: null,
      noticeLanguage: null,
    };
  }

  // Removing the default would leave the workspace defaulting to a language it no longer permits
  // — a document the server now refuses to save, and a contradiction even where it saves. The
  // default moves with it, and the caller says so out loud.
  return {
    next: { ...state, allowed, defaultLanguage: allowed[0] },
    changed: true,
    blocked: null,
    notice: "defaultLanguageMoved",
    noticeLanguage: code,
  };
}

/**
 * The options the Default Language picker may offer.
 *
 * The current value is always among them, even when the policy excludes it. That is the same
 * decision the timezone picker documents one control above: a stored value missing from its own
 * list renders as an empty control, and an empty control is how a setting gets dropped by the
 * next save. It is FLAGGED instead — see `isDefaultLanguageOutOfPolicy` — so an Owner reads why
 * it is there rather than finding it silently kept or silently gone.
 */
export function defaultLanguageOptions(state: LanguagePolicyState): SupportedLanguage[] {
  const scope = meetingScopeLanguages();
  const permitted = state.restricted
    ? scope.filter((language) => state.allowed.includes(language.code))
    : scope;

  if (!state.defaultLanguage || permitted.some((l) => l.code === state.defaultLanguage)) {
    return permitted;
  }

  const current = getLanguageByCode(state.defaultLanguage);
  return current ? [...permitted, current] : permitted;
}

/**
 * Whether the saved default language sits outside the policy the workspace is now enforcing.
 *
 * Only reachable from data written before this rule existed, or from a policy edited elsewhere:
 * every transition in this module keeps the two in step.
 */
export function isDefaultLanguageOutOfPolicy(state: LanguagePolicyState): boolean {
  if (!state.restricted || !state.defaultLanguage) return false;
  return !state.allowed.includes(state.defaultLanguage);
}
