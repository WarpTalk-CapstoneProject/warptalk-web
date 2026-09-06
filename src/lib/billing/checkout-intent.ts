/**
 * "I picked a plan before I had an account" — carried across sign-up. WT-491.
 *
 * A guest chooses a plan on the landing page and is sent to `/login`. By the time they come back
 * the choice is gone: `handleChoosePlan` pushed the plain get-started href, so the plan they
 * clicked never travelled with them, and they landed in an empty workspace with no sign that they
 * had asked to buy anything. The purchase they started could not be finished from where they
 * ended up.
 *
 * The intent is carried in the URL rather than in storage. It has to survive a redirect to
 * `/login`, a possible detour through `/register` and email verification, and a return to a
 * different tab — sessionStorage survives none of that reliably, and a cookie would outlive the
 * intent itself and re-open checkout on a later, unrelated visit.
 *
 * The plan is identified by SLUG, not id: the checkout request is already keyed by `planSlug`
 * (see CreateCheckoutSessionRequest), so nothing has to be translated on the way in or out.
 */

// Relative, with the extension: this module's unit tests run under the plain node test runner,
// which does not resolve "@/", and this is a real value rather than an erased type import.
import { workspaceActivationPath } from "../workspace/workspace-routes.ts";

/** The query key holding the chosen plan. Present ⇒ the visitor is mid-purchase. */
export const CHECKOUT_PLAN_PARAM = "planSlug";

/** Anything that reads like `URLSearchParams` — the real one, or a test's plain map. */
export type ReadableParams = Pick<URLSearchParams, "get">;

/**
 * A path with the chosen plan attached, or the path unchanged when nothing was chosen.
 *
 * Appends rather than replaces, so a path that already carries a `callbackUrl` (the login
 * redirect) keeps it.
 */
export function withCheckoutIntent(path: string, planSlug?: string | null): string {
  const slug = planSlug?.trim();
  if (!slug) return path;

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${CHECKOUT_PLAN_PARAM}=${encodeURIComponent(slug)}`;
}

/**
 * The plan the visitor picked before signing in, or null.
 *
 * Whitespace-only is null rather than an empty string, so a caller can branch on the value alone
 * without also testing for blank — a `?planSlug=` left behind by a half-built link would otherwise
 * read as "mid-purchase" and open checkout for a plan that does not exist.
 */
export function readCheckoutIntent(params: ReadableParams | null | undefined): string | null {
  const slug = params?.get(CHECKOUT_PLAN_PARAM)?.trim();
  return slug ? slug : null;
}

/**
 * Where a visitor goes once their workspace exists: the activation landing, with their plan named.
 *
 * A plan grid rather than a checkout session directly. Creating the session needs an amount and a
 * currency that only the grid has resolved, and sending someone straight to a payment page for a
 * plan they chose several screens ago — possibly before registering — skips the one moment they
 * can confirm what they are about to be charged.
 *
 * The LANDING's grid, not `/{slug}/payment/plans`. This is reached only when a workspace was
 * created and the checkout did not complete, which is by definition an unpaid workspace — and an
 * unpaid workspace is redirected off every route but the landing (see lib/billing/workspace-paywall).
 * Pointing here keeps the plan the buyer picked; pointing at the old path would have arrived at
 * the same grid via a redirect that drops the query string, silently losing their choice.
 */
export function checkoutContinuationPath(workspaceSlug: string, planSlug?: string | null): string {
  return withCheckoutIntent(workspaceActivationPath(workspaceSlug), planSlug);
}
