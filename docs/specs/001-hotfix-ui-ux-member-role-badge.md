# SPEC: Hotfix UI/UX Member Role & Membership Type Badge Display

## 1. Overview & Context
In `warptalk-web`, the user card footer in the sidebar (`linear-sidebar.tsx`) and member list cards currently concatenate `Role` and `MembershipType` using `Role · MembershipType` (e.g. `Owner · Internal`). On tight UI elements, this string gets truncated to `Owner · Inter...`, resulting in poor readability and layout clutter.

## 2. Proposed Display Logic (Priority Hierarchy)
Instead of concatenating two labels with a middle dot, the UI badge will display a single, prioritized, non-truncated label:

1. **Owner**: If `role.toLowerCase() === 'owner'`, display **`Owner`**.
2. **Admin**: Else if `role.toLowerCase() === 'admin'`, display **`Admin`**.
3. **External Member**: Else if `membershipType.toLowerCase() === 'external'`, display **`External Member`**.
4. **Internal Member**: Else, display **`Internal Member`** (or **`Member`**).

### Comparison Matrix:

| Current Display (Truncated) | Proposed Hotfix Display |
| :--- | :--- |
| `Owner · Inter...` | `Owner` |
| `Admin · Inter...` | `Admin` |
| `Member · External` | `External Member` |
| `Member · Internal` | `Internal Member` |

## 3. Affected Components
- `src/components/layout/linear-sidebar.tsx` (User account panel footer)
- `src/app/(app)/[workspaceSlug]/members/page.tsx` (Member list table/cards if applicable)
- `src/app/(app)/[workspaceSlug]/settings/account/profile/page.tsx` (Profile overview badge)

## 4. Verification Plan
1. Test with an `Owner` account: Verify sidebar badge shows `Owner`.
2. Test with an `Admin` account: Verify sidebar badge shows `Admin`.
3. Test with an `Internal Member` account: Verify sidebar badge shows `Internal Member`.
4. Test with an `External Member` account: Verify sidebar badge shows `External Member`.
