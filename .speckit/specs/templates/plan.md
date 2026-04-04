# Technical Plan: {FEATURE_TITLE}

> **Spec ID**: NNN
> **Link to Spec**: [spec.md](./spec.md)
> **Status**: `draft` | `approved`

---

## 1. Phase -1: Constitution Gates

> ALL must be checked before status is `approved`.

- [ ] Does this plan adhere to Next.js App Router rules (Article I)?
- [ ] Are Client Components kept at the leaf nodes (Article II)?
- [ ] Is global UI state handled by Zustand and server state by React Query (Article III)?
- [ ] Is CSS managed strictly via Tailwind v4/shadcn/base-ui without inline styling abuse (Article IV)?
- [ ] Are all API interactions routed through `src/services` (Article V)?

---

## 2. Technical Architecture Overview

> Briefly describe the technical approach. How does the user navigate? What components will interact?

{Architecture overview text}

---

## 3. Route Changes

> Define any new pages or layouts in `src/app`. Focus on Server Components vs Client Components.

| Route / File | Purpose | Type (Server/Client) | Layout / Page |
|---|---|---|---|
| `app/(feature)/page.tsx` | Main entry point for the feature. | Server | Page |
| `app/(feature)/layout.tsx` | Wrapper layout. | Server | Layout |

---

## 4. Components Breakdown

> Detail new components to be created inside `src/components`.

### 4.1 `src/components/ui/{Component}.tsx`
> Reusable generic UI components (Buttons, Modals, Inputs). Usually Client components.

- **Props**: `{ ... }`
- **Responsibilities**: { ... }

### 4.2 `src/components/features/{featureName}/{Component}.tsx`
> Feature-specific components.

- **Props**: `{ ... }`
- **State Hooks**: `{ ... }`
- **Responsibilities**: { ... }
- **Client/Server**: Client

---

## 5. State Management

> Describe changes to stores or React Query hooks.

### 5.1 Global UI State (Zustand: `src/stores/`)
- Store name: `use{Feature}Store`
- New state fields: `isModalOpen: boolean`, `selectedId: string`
- Mutators: `openModal()`, `closeModal()`, `setSelectedId()`

### 5.2 Server State (React Query: `src/hooks/`)
- Query key: `['feature', featureId]`
- Hook name: `useGetFeature(id)`
- Mutation hook: `useUpdateFeature()`

---

## 6. API Services Integration

> Define REST API interfaces or SignalR event listeners in `src/services`.

### 6.1 Endpoints (`src/services/{feature}.service.ts`)
- `GET /api/v1/{resource}` -> `getFeature()`: Returns `{ ... }`
- `POST /api/v1/{resource}` -> `createFeature(data)`: Mutates and invalidates React Query.

### 6.2 Data Models / Types (`src/types/{feature}.d.ts`)
```typescript
export interface FeatureModel {
  id: string;
  name: string;
}
```

---

## 7. Edge Cases & Fallbacks

- Loading state handling (Skeletons/Spinners)
- Error boundaries / Error tracking
- Fallback for WebSocket disconnections 

---

## 8. Complexity Tracking & Deviations

> If any part of this plan deviates from the Constitution, explain WHY and get explicit approval.

- [ ] None. Entirely standard.
- [ ] Deviates from Article [X]: {Explanation of deviation}
