# Continuous Workflow Rule

## Purpose

This rule must be followed before, during, and after every coding task.

The goal is to keep the project understandable for:
- The project owner
- Future developers
- AI agents working on the codebase

Every code change must be reflected in the documentation inside `/agents/page-docs`.

---

## Required Workflow

### 1. Before Working

Before making any code change:

- Read this rule file.
- Identify which page, feature, or module will be affected.
- Read the related documentation inside `/agents/page-docs`.
- If no related documentation exists, create a new markdown file.

---

### 2. During Work

While changing code, pay attention to:

- New files created
- Files edited
- Components renamed or moved
- UI layout changes
- Route changes
- API changes
- State management changes
- Props or data flow changes
- Authentication or permission changes
- Reusable logic that should be documented

---

### 3. After Work

After completing the code change, update the related markdown file inside `/agents/page-docs`.

Each update should explain:

- What changed
- Why it changed
- Which files were affected
- How the page or feature currently works
- Important UI behavior
- Important logic
- Known limitations
- Testing checklist
- Notes for future maintainers

---

## Documentation Structure

Use this structure:

```txt
/agents
  /rules
    continuous-workflow-rule.md
  /page-docs
    landing-page.md
    /authentication
      overview.md
      login.md
      register.md
      logout.md
```
