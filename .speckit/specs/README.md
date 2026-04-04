# WarpTalk Frontend — Spec-Driven Development Guide

> **Repo**: `warptalk-web`
> **Methodology**: [github/spec-kit](https://github.com/github/spec-kit) — Spec-Driven Development (SDD)
> **Constitution**: [memory/constitution.md](../memory/constitution.md) — read this first.

---

## What is SDD?

Instead of jumping straight into coding, we write a **specification first**, then a **technical plan**, then an **executable task list**. The AI (or any developer) then implements from the task list — not from vague memory.

This eliminates: "what was the requirement again?", drift from design, and untraceable decisions.

---

## Directory Structure

```
.speckit/
├── memory/
│   └── constitution.md          ← Immutable governing principles (READ FIRST)
└── specs/
    ├── README.md                 ← This file
    ├── templates/
    │   ├── spec.md               ← Copy this to start a new feature spec
    │   ├── plan.md               ← Copy this after spec is approved
    │   └── tasks.md              ← Copy this after plan is approved
    │
    ├── 001-{feature-name}/       ← One folder per feature
    │   ├── spec.md               ← Business requirements
    │   ├── plan.md               ← Technical implementation plan
    │   └── tasks.md              ← Executable task list
    │
    └── 002-{another-feature}/
        └── ...
```

---

## Workflow: Step by Step

### Step 1 — Create a Spec (`spec.md`)

When to do this: **Before any code is written for a new feature.**

1. Determine the next spec number (look at existing folders in `specs/`)
2. Create folder: `specs/NNN-{feature-kebab-name}/`
3. Copy `templates/spec.md` → `specs/NNN-{feature}/spec.md`
4. Fill in: Problem Statement, User Stories, Acceptance Criteria
5. Mark `[NEEDS CLARIFICATION]` for every ambiguity — **do NOT guess**
6. Complete the Spec Completeness Checklist at the bottom
7. Get it reviewed and set status to `approved`
8. Create branch: `git checkout -b feat/NNN-{feature-name}`

> 💡 **Prompt to AI**: `"Create a spec for: {describe what you want to build}"`

---

### Step 2 — Create a Plan (`plan.md`)

When to do this: **After spec is `approved`.**

1. Copy `templates/plan.md` → `specs/NNN-{feature}/plan.md`
2. Complete Phase -1 Constitution Gates — all must pass.
3. Describe components breakdown, Next.js routing, state management changes.
4. Fill in Complexity Tracking if any Constitution Article was not fully satisfied.

> 💡 **Prompt to AI**: `"Create a technical plan for the spec at specs/NNN-{feature}/spec.md based on Frontend Constitution"`

---

### Step 3 — Create Tasks (`tasks.md`)

When to do this: **After plan is `approved`.**

1. Copy `templates/tasks.md` → `specs/NNN-{feature}/tasks.md`
2. Read through the plan and fill in specific task items (Types, APIs, UI Components, Server Routes).
3. Share with team and assign tasks.

> 💡 **Prompt to AI**: `"Generate tasks from specs/NNN-{feature}/plan.md"`

---

### Step 4 — Implement

Work through tasks in order. Mark `[/]` when starting, `[x]` when done.

> 💡 **Prompt to AI**: `"Implement task: [task description] following Frontend Constitution Articles I-VII"`

---

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Spec folder | `NNN-{kebab-name}` | `003-host-controls` |
| Branch | `feat/NNN-{kebab-name}` | `feat/003-host-controls` |
| Spec status | `draft` → `needs-clarification` → `approved` | — |
| Commit | Conventional Commits | `feat(meeting): add host-only mute button` |
