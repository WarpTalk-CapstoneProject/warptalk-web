# WarpBot full page (`/{workspaceSlug}/ai-chat`)

## What changed (WT-843, 2026-09-30)

`sendContent()` cleared the draft and then awaited the send mutation with no error handling, so a
failed send (backend / AI worker error) silently lost the typed message. It now wraps the send and
refetches in `try/catch`; on failure it **restores the draft** (`setDraft(content)`) and shows
`toast.error(t("toasts.messageSendFailed"))`. This matches the sidebar widget
(`global-chatbot.tsx`).

## Files affected

- `src/app/(app)/[workspaceSlug]/ai-chat/page.tsx`
- `messages/{en,vi,ja}/aiChat.json` (new key `toasts.messageSendFailed`)

## Notes

- The optional `keepPermissionPrompt` behaviour (skip `clearPluginCards()`) from `development` is preserved.
- Limitation: only the send/refetch path is covered; other mutations keep their own handling.

## Testing checklist

- [ ] Force the send request to fail: draft reappears in the composer and an error toast shows.
- [ ] Successful send still clears the draft and refreshes the conversation and list.
- [ ] Toast text is localized in en/vi/ja.
