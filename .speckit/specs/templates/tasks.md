# Task List: {FEATURE_TITLE}

> **Spec ID**: NNN
> **Link to Plan**: [plan.md](./plan.md)
> **Branch**: `feat/NNN-{feature-kebab-name}`

---

## Instructions for AI Agent

1. Read `spec.md` and `plan.md` to understand the goal.
2. Update this file as you progress:
   - Change `[ ]` to `[/]` when starting a task.
   - Change `[/]` to `[x]` when completed.
3. Every component creation MUST respect Next.js App Router rules (Server Component by default, `"use client"` pushed down) from the Constitution.
4. If a task implies testing but a test framework is not set up, perform manual verification steps instead.

---

## Phase 0: Type Definitions & Services Setup

> Define shared interfaces and mock APIs first.

- [ ] Create/Update types in `src/types/` for the feature models.
- [ ] Create/Update API service in `src/services/{feature}.service.ts` using configured axios.

---

## Phase 1: State Management Hook/Store Development

> Prepare local/global state stores without hooking UI yet.

- [ ] Create Zustand store `src/stores/` (if global UI state is needed).
- [ ] Create React Query hooks `src/hooks/` (if server-side data fetching/mutation is needed).

---

## Phase 2: Building UI Components

> Build out isolated components in `src/components`.

- [ ] `[P]` Create generic/shared UI components `src/components/ui/` if required.
- [ ] `[P]` Create feature components `src/components/features/{feature}/`.

---

## Phase 3: Route Integration

> Attach components to Next.js routes.

- [ ] Create/Update `src/app/{route}/page.tsx` (Server Component).
- [ ] Inject components, hydrate state, or fetch initial data on server.

---

## Phase 4: Final Polish & Verification

- [ ] Confirm no `eslint` or `tsc` compiler errors.
- [ ] Confirm UI styling matches design (responsive testing).
- [ ] Refactor complex conditionals/inline code.
