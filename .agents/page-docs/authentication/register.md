# Register Page Documentation

This document maintains the state, changes, and logic for the Register Page.

## Current Route

- Route: `/register`
- Source: `src/app/(auth)/register/page.tsx`
- Shared shell: `src/components/auth/cinematic-auth-shell.tsx`

## Latest Changes

- Rebuilt `/register` into the requested dark two-column registration interface.
- The large-screen left column is exactly `w-[52%]`, hidden below `lg`, and uses the local Investor Deck video source:
  - `public/assets/videos/auth-investor-deck.mp4`
- No dark overlay, gradient, or tint mask is placed over the video.
- Added motion reveal for the left brand content.
- The left video column now contains only the WarpTalk monochrome icon and lowercase `warptalk` wordmark; the previous Aurora label, heading, description, and steps are removed.
- Removed the GitHub social button.
- Moved the single Google button below the registration form and login link, separated by an `Or` divider.
- Added reusable auth components in the shared shell:
  - `StepItem`
  - `SocialButton`
  - `InputGroup`
- The auth route group layout now returns children directly so the shared auth shell can occupy the full viewport.
- Global body styling in `globals.css` and the root body class in `src/app/layout.tsx` now use a black background and white text to match the requested auth design and avoid light background gaps.
- Updated registration fields to match the dark auth form:
  - First Name
  - Last Name
  - Email
  - Password with visibility toggle
- The submit handler maps `firstName + lastName` into the existing backend `fullName` field.
- The Google social button is visual only and uses the shared Google mark from `src/components/auth/cinematic-auth-shell.tsx`.

## WT-649 — Field-level validation (latest)

Registration now answers a bad field where the field is, instead of after a round trip.

**What changed**

- `getRegisterSchema` (`src/app/(auth)/register/page.tsx`) gained length ceilings mirroring the
  server: full name 150, email 255, password 128. Each has a counterpart in the API's
  `UserConstants`; these exist to name the field, not to be the guard.
- `fullName` is now `z.string().trim().min(1)`. The order matters: reversed, a name of nothing but
  spaces passes client validation and is only rejected by the API.
- The submit `catch` uses the shared `getErrorMessage` from `src/lib/api/errors.ts` instead of
  reading `response.data.error` by hand.

**Why**

QA entered a name of spaces, and a name longer than the `auth.users.full_name` column. The first
was refused by the API and surfaced as an anonymous toast on step 3 of the wizard — while the Full
Name input sits on step 2, so the person was told something was wrong on a screen with nothing to
fix. The second had no validation rule at all in front of it and failed inside the database, coming
back as a generic server error.

**Correction, from running the stack rather than reading it.** The first version of this note said
the API flattened field names away. That was backwards. A FluentValidation failure does not return
`{ error, code }` at all — it returns ASP.NET's ValidationProblemDetails:

```json
{ "title": "One or more validation errors occurred.",
  "errors": { "FullName": ["Full name cannot exceed 150 characters."] } }
```

The field name and the reason were both there. What was missing was a client that read them:
`getErrorMessage` looked only at `message` / `Message` / `error`, none of which exist on that
shape, so it fell through to the caller's fallback — in **every** feature of the app, not only on
this form. `{ error, code }` is what a SERVICE failure returns ("Email already registered"); both
are 400s from the same endpoint.

`src/lib/api/errors.ts` now reads `errors` too. The generic `title` is deliberately never shown:
swapping one meaningless sentence for another is not a fix.

Catching it client-side is still right — it puts the error on the input at step 2 instead of in a
toast at step 3 — but it is no longer the only thing standing between a validation failure and a
readable message.

The hand-rolled `catch` only ever looked at a response body, so every transport failure — offline,
502, 504, a rate limit — read as "Registration failed. Please try again.", telling the person to
retry the one thing that could not work yet. `getErrorMessage` already distinguishes those.

**Deliberately not done**

No `maxLength` attribute on the Full Name input. It would make an over-long name impossible to type
or paste, so the `.max()` message could never appear and the case could only be exercised by curl.

**Testing checklist**

- [x] `npm run lint`, `npm run typecheck` — no findings in the touched files.
- [ ] Enter only spaces in Full Name on step 2 → inline error, no network request.
- [ ] Enter 151 characters in Full Name → inline error naming the 150 limit.
- [ ] Register with the API stopped → a transport message, not "Registration failed".

## Current Behavior

- Form posts to `API.auth.register`.
- On success, the page stores auth state with `useAuthStore`, writes the `access_token` cookie, and redirects to `/dashboard`.
- Password validation currently requires at least 8 characters to match the requested helper copy.

## Known Limitations

- Google social registration is presentational only.
- The video-column brand block uses `public/assets/logos/warptalk-icon-1k.jpg` inverted to white on the dark video.
- A CSS-only background could approximate the abstract lighting/noise if needed, but it will not reproduce the exact motion and texture of the video.

## Testing Checklist

- [x] Run ESLint on register and auth shell files.
- [x] Open `/register` on desktop and verify the two-column dark layout.
- [x] Verify GitHub is removed and the Google button is below the form.
- [ ] Open `/register` below `lg` width and verify the video column is hidden.
- [ ] Verify password show/hide works.
- [ ] Confirm successful registration redirects to `/dashboard`.
