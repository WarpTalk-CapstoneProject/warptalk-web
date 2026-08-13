# Dashboard Navigation Regression Tests

## Automated Route Smoke Test

Run with the dev server active:

```bash
npm run test:routes
```

The script verifies:

- All host sidebar routes return `200`:
  - `/dashboard`
  - `/rooms`
  - `/my-meetings`
  - `/history`
  - `/ai-summaries`
  - `/ai-chat`
  - `/terminology`
  - `/voice-profiles`
  - `/feedback`
  - `/settings`
- Invalid routes still return `404`:
  - `/this-route-does-not-exist`
  - `/dashboard/unknown-page`
  - `/rooms/not-real`

## Manual Browser Back Test

Use Chrome at 100% zoom:

1. Open `/feedback`.
2. Confirm the sidebar shows all host nav items, including `Feedback` and `Settings`.
3. Click `Settings`.
4. Confirm `/settings` opens inside the same dashboard shell, not the root 404 page.
5. Press the browser Back button.
6. Confirm `/feedback` returns with the sidebar still visible and the active pill/text readable.

Repeat the same flow for:

- `/dashboard` -> `/settings` -> Back
- `/rooms` -> `/voice-profiles` -> Back
- `/my-meetings` -> `/history` -> Back
- `/ai-chat` -> `/settings` -> Back
- `/terminology` -> `/feedback` -> Back

## Known Risk Covered

This prevents the previous issue where sidebar links pointed to missing routes. Entering a root 404 page from the dashboard and then using browser Back could leave the shared sidebar active-pill state visually out of sync.
