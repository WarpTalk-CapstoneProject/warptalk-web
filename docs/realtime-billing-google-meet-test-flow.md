# Realtime Billing Test Flow - Google Meet Integration

Scope: Google Meet is the only external meeting platform in the demo. Other external platforms are out of scope.

## Preconditions

- Workspace has an Enterprise trial or Enterprise contract.
- Enterprise plan features include `external_integrations.google_meet = true`.
- Workspace owner has billing access.
- System admin account can open `/billing`.
- BillingService, Gateway, Redis, AI workers, and frontend are running.

## Flow

1. Workspace owner opens workspace billing.
2. Owner opens **Request contract**.
3. Owner selects:
   - requested monthly credits
   - workspace members
   - supported languages
   - AI services
   - Google Meet integration
4. Owner submits the request.
5. System admin opens `/billing`.
6. Admin reviews the sales inquiry and confirms that requested features include `google_meet`.
7. Admin creates the workspace contract from the Enterprise baseline.
8. Admin verifies the contract terms are saved on the workspace subscription.
9. Owner creates or opens a meeting with Google Meet integration enabled.
10. Participant speaks in Google Meet.
11. WarpTalk captures audio through the external bridge and publishes audio chunks.
12. AI pipeline processes:
    - STT from audio seconds
    - translation only when source and target languages differ
    - TTS or voice clone from synthesized character count
13. Billing worker accumulates usage and settles credits.
14. Owner/admin opens billing usage.
15. Verify credits decreased and usage history shows STT, translation, and TTS/voice clone entries.

## Expected Billing Rules

- STT is charged once per source audio stream.
- Translation is charged only when `source_language != target_language`.
- TTS is charged when new audio is synthesized.
- Voice clone is charged separately from standard TTS.
- Cache hits and passthrough translation do not create charges.
- Credits are settled through the subscription atomic settlement path.

## Acceptance Checks

- Google Meet is the only external platform visible in request/contract scope.
- Contract request includes `google_meet` only when selected.
- Enterprise baseline exposes Google Meet integration in plan features.
- Integration schema accepts provider `google_meet` only.
- No unsupported external platform scope appears in product docs or UI.
