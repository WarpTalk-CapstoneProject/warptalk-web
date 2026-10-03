# Workspace Settings

Workspace Settings is the policy-intent surface for Owners and permitted Admin operational controls. Settings are read back after save; `AllowExternalLlm` is normalized to `true`. `UseGlobalGlossary` controls whether Transcript/Translation consumers merge global terms. Controls without a verified downstream consumer must be shown as persisted-only until a follow-up consumer contract exists.

Owner-only policy fields include external collaboration, verified domains/domain enforcement, retention, profanity and AI/security policy. Members and External Members cannot access management settings. Running meetings keep their session snapshot; new requests/sessions resolve the latest workspace policy.

Workspace-backed consumers currently verified: external-collaboration/domain enforcement and invitation classification, allowed target-language validation, PII/DLP document guardrails, profanity filtering, `UseGlobalGlossary`, and `AllowExternalLlm=true` normalization. `MaxActiveRooms`, host-approval propagation, voice-cloning propagation, artifact-retention cleanup, translation profile, and timezone remain `Persisted only / not enforced` until their owning downstream service adds a contract and E2E test.

## Auto-save behavior

Owner/Admin controls now use partial workspace settings PATCH requests. Switches, selects, target-language changes, and DLP keyword changes commit immediately. Numeric controls commit on Enter or blur after integer/range validation (`maxActiveRooms` 1–50; `artifactRetentionDays` 0–3650). Requests are serialized in memory so rapid edits cannot complete out of order. The page header reports saved, saving, or failed state and warns before unloading while a request is pending.

Verified-domain add/remove continues to use the dedicated verified-domain endpoints because those operations create and revoke domain verification records; their pending/error state is included in the page save badge.

## WarpBot starters on the Settings tabs (2026-10-03)

Three Settings pages register what they show as WarpBot page context for an Owner/Admin, so an
empty WarpBot conversation opened there offers three starters each:

| Page | pageType | Builder | What is sent |
|---|---|---|---|
| Workspace settings (`settings/page.tsx`) | `workspace_settings` | `workspaceSettingsAssistantSnapshot` | Default language, timezone, allowed meeting languages, voice cloning, meetings at once (stored, the plan's ceiling and the one in force), retention days, minutes template and classification, profanity filter, translation tone. |
| Security (`settings/security/page.tsx`) | `workspace_security` | `securityAssistantSnapshot` | External collaboration, verified-domain rule and the domain list, invitation expiry, whether members may add any plugin, external AI models, PII redaction, the keyword filter and HOW MANY keywords it holds. |
| Features (`settings/features/page.tsx`) | `workspace_features` | `featuresAssistantSnapshot` | Plan slug, whether a subscription is live, features included / not included, limits. Labelled in English whatever the page's language. |

Rules: the SAVED settings (`settingsQuery.data`), never the form's draft; the blocked keywords
themselves never leave the page; a domain list that was not read has no key; a cold entitlement
snapshot says "not available yet" instead of listing defaults. Features is open to every member, so
its context is too. It is a page context, not a tool. See `workspace-insights.md` ("WarpBot answers from the page") for the shared rules; the builders and their tests are `lib/workspace/settings-assistant-snapshots.ts` and `lib/workspace/__tests__/settings-assistant-snapshots.test.ts`.

Testing checklist: Owner/admin on each page with WarpBot empty → three starters and a context pill
named after the page; change a setting and wait for the save → the next answer uses the new value;
a member on Workspace settings or Security → no starters.
