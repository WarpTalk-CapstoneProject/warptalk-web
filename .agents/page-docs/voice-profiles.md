# Voice Profiles

Route: `/[workspaceSlug]/voice-profiles`.

The Voice Profiles page lists the current user's voice clone profiles in a dense Linear-style table with filters, search, selection actions, and an upload/record dialog for creating or replacing a profile sample.

## Current Behavior

- The table shows Name, Member, Health, Language, and Status columns.
- Clicking a profile name in the Name column opens the upload/edit dialog directly with that profile's existing display name and language prefilled.
- Row selection still works from the checkbox or row surface; the name cell stops propagation so it can be used as the direct edit target.
- Workspace managers see an Assigned member select in the upload dialog. The closed select trigger renders only the selected member's display name, not the UUID value.
- Non-manager users see a read-only Assigned member field with only the display name.
- Saving a sample still uses the existing create/replace voice profile flow. There is no standalone frontend rename flow because the backend currently exposes create, list, delete, catalog, and preferred-voice endpoints, but no profile rename/update endpoint.

## Affected Files

- `src/app/(app)/[workspaceSlug]/voice-profiles/page.tsx`

## Testing Checklist

- Open `/[workspaceSlug]/voice-profiles`.
- Click a profile name in the Name column and verify the upload dialog opens with the profile name editable.
- Open `New Profile` and verify Assigned member shows a human name in the closed trigger.
- For manager roles, open the Assigned member dropdown and verify the choices still include enough context to distinguish members.
- Run `npm run typecheck`.
