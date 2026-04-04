# WarpTalk Frontend — Constitution

> **Status**: Immutable governing principles. Amendments require team leader approval + documented rationale.
> **Target**: `warptalk-web` — Next.js 16 Web Application
> **Last updated**: 2026-04-04

---

## Article I — Architecture (Next.js App Router)

The codebase strictly adheres to Next.js App Router architecture with a clear separation of concerns under the `src` directory:

- `src/app`: ONLY contains routing logic, layout, and page composition.
- `src/components`: UI elements. Subdivided into `ui/` (generic shadcn/base-ui pieces) and `features/` (domain-specific components).
- `src/hooks`: Custom React hooks encapsulating component-level logic.
- `src/services`: Abstracts all external communication (REST API/gRPC web proxy/SignalR). Components must NEVER call `fetch` directly.
- `src/stores`: Client-side global state management (Zustand).
- `src/lib`: Utility functions and shared helpers.

**Gate before implementation:**
- [ ] No `fetch` calls directly inside components; use `services/`.
- [ ] No routing logic outside of `src/app/`.

---

## Article II — Components & Rendering (RSC)

We leverage React Server Components (RSC) to minimize client-side javascript.

**Rules:**
- All components in `src/app/` MUST be Server Components by default.
- The `"use client"` directive should be pushed down to the leaf node (e.g., interactive buttons, forms). Do not put `"use client"` on layout wrappers unless absolutely necessary.
- Pass data from Server Components to Client Components via props. Avoid fetching data on the client if it can be fetched on the server (unless using React Query for active invalidation/polling).

---

## Article III — State Management

**3.1 Server State:**
Use **React Query** (`@tanstack/react-query`) for all asynchronous server state fetching, caching, and mutations happening on the client-side.

**3.2 Client State:**
Use **Zustand** for global UI state (e.g., sidebar collapse, active modal) that needs to be accessed across disjointed components. Do not put server data into Zustand.

---

## Article IV — Styling

**Technology: Tailwind CSS v4 & generic UI libraries**
- Use **Tailwind CSS v4** utility classes for styling. Do not write custom CSS or add new classes in global CSS files unless absolutely necessary.
- Foundation: `@base-ui/react` or `shadcn`. Use pre-configured utility components for buttons, dialogs, inputs, etc.
- No inline styles (`style={{...}}`) except for dynamic calculated values (e.g. dynamic height/width).

---

## Article V — Inter-Service Communication

All API calls must use predefined clients in `src/services`:

- **REST APIs**: Use `axios` with configured interceptors for attaching JWT tokens (from `next-auth`).
- **Real-Time Pipeline**: Use `@microsoft/signalr` for STT/TTS data pipelines. Ensure connections are singleton or managed via context so multiple WebSocket connections aren't spawned accidentally.

---

## Article VI — Test-First Development (Non-Negotiable)

*Note: Specific test runner mandates (Jest/Playwright) are pending team addition, but the SDD methodology remains.*

**Implementation step requirements:**
1. Define the spec and plan first.
2. Outline UI component inputs/outputs (props/callbacks) in `plan.md`.
3. Stub empty components.
4. Implement component logic and ensure manual verification aligns with spec acceptance criteria.

---

## Article VII — Branching & Commit Convention

### Branch naming (mandatory prefix):
| Prefix | Usage |
|---|---|
| `feat/` | New feature (must have spec file) |
| `hotfix/` | Production bug fix |
| `refactor/` | Code restructuring (no feature change) |
| `chore/` | Build, deps, config |
| `docs/` | Documentation only |

### Commit format — Conventional Commits:
```
feat(meeting): add host control UI
fix(auth): correct local storage token sync
refactor(streaming): update SignalR hook implementation
chore(deps): update zustand
```

### PR rules:
- **Every `feat/` branch MUST have** `.speckit/specs/NNN-{feature}/spec.md` approved before PR is opened.
- PR description MUST link to the spec file.

---

## Amendment Process

Modifications to this constitution require:
1. Written rationale documented in a `docs/` PR.
2. Approval by project Leader.
3. Update the "Last updated" date above.
