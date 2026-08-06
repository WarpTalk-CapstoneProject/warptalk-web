# Workspace Settings

Workspace Settings is the policy-intent surface for Owners and permitted Admin operational controls. Settings are read back after save; `AllowExternalLlm` is normalized to `true`. `UseGlobalGlossary` controls whether Transcript/Translation consumers merge global terms. Controls without a verified downstream consumer must be shown as persisted-only until a follow-up consumer contract exists.

Owner-only policy fields include external collaboration, verified domains/domain enforcement, retention, profanity and AI/security policy. Members and External Members cannot access management settings. Running meetings keep their session snapshot; new requests/sessions resolve the latest workspace policy.

Workspace-backed consumers currently verified: external-collaboration/domain enforcement and invitation classification, allowed target-language validation, PII/DLP document guardrails, profanity filtering, `UseGlobalGlossary`, and `AllowExternalLlm=true` normalization. `MaxActiveRooms`, host-approval propagation, voice-cloning propagation, artifact-retention cleanup, translation profile, and timezone remain `Persisted only / not enforced` until their owning downstream service adds a contract and E2E test.

## Auto-save behavior

Owner/Admin controls now use partial workspace settings PATCH requests. Switches, selects, target-language changes, and DLP keyword changes commit immediately. Numeric controls commit on Enter or blur after integer/range validation (`maxActiveRooms` 1–50; `artifactRetentionDays` 0–3650). Requests are serialized in memory so rapid edits cannot complete out of order. The page header reports saved, saving, or failed state and warns before unloading while a request is pending.

Verified-domain add/remove continues to use the dedicated verified-domain endpoints because those operations create and revoke domain verification records; their pending/error state is included in the page save badge.
