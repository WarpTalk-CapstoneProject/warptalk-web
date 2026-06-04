# WarpTalk B2B Dashboard And Meeting Plan

This document captures the B2B dashboard split and meeting-flow direction for WarpTalk Web. It is intended as a downloadable/readable product and engineering reference.

## 1. User Groups

| Group | Role | Primary Goal |
|---|---|---|
| Public | Anonymous | View landing page, login, register, reset password. |
| Customer company | Participant | Join meetings, configure devices/languages, view permitted summaries and transcripts. |
| Customer company | Host | Create rooms, run meetings, manage participants, review post-meeting artifacts. |
| Customer company | Workspace Manager | Manage members, rooms, terminology, feedback, usage, and artifact governance. |
| Customer company | Workspace Owner | Own billing, security, retention, audit, workspace policy, and high-level operations. |
| WarpTalk internal | Internal Manager | Manage tenants, plans, service health, support visibility, and AI operations. |

## 2. Dashboard Route Map

| Dashboard | Route | Audience | Current Purpose |
|---|---|---|---|
| Host Dashboard | `/host/dashboard` | Host | Room operations, live sessions, participants, translated time, operational focus. |
| Participant Dashboard | `/participant/dashboard` | Participant | Upcoming invites, setup entry points, shared summaries, personal readiness. |
| Workspace Dashboard | `/workspace/dashboard` | Workspace Manager/Owner | Usage, members, rooms, quotas, department activity, artifact governance. |
| Internal Dashboard | `/internal/dashboard` | WarpTalk staff | Tenants, platform health, support, plans, AI pipeline status. |

Legacy routes are compatibility redirects:

| Legacy Route | Redirect Target |
|---|---|
| `/dashboard` | `/host/dashboard` |
| `/workspace` | `/workspace/dashboard` |
| `/admin` | `/internal/dashboard` |

## 3. Role Permission Matrix

| Capability | Participant | Host | Workspace Manager | Workspace Owner | WarpTalk Internal |
|---|---:|---:|---:|---:|---:|
| Join meeting | Yes | Yes | Yes | Yes | Scoped support |
| Setup mic/camera/speaker/language | Yes | Yes | Yes | Yes | Scoped support |
| Create room | No | Yes | Yes | Yes | Yes |
| Start/end meeting | No | Yes | Optional | Yes | Scoped support |
| Manage participants | No | Yes | Yes | Yes | Scoped support |
| View own artifacts | Permissioned | Yes | Yes | Yes | Scoped support |
| View workspace artifacts | No | Room-scoped | Yes | Yes | Scoped support |
| Edit AI summary | No | Yes | Yes | Yes | Scoped support |
| Approve/publish AI summary | No | Yes | Yes | Yes | No by default |
| Manage terminology | Suggest only | Suggest only | Yes | Yes | Global support |
| Manage members | No | No | Yes | Yes | Scoped support |
| Billing and plan | No | No | View only | Yes | Yes |
| Platform health | No | No | No | No | Yes |

## 4. Meeting Lifecycle V1

| Step | Route | Purpose |
|---|---|---|
| Create room | `/rooms/create` | Host creates instant/scheduled rooms and chooses language/recording/summary settings. |
| Room detail/preflight | `/rooms/[id]` | Review room settings, invite link, participant status, and setup/start actions. |
| Setup | `/rooms/[id]/setup` | Test mic, camera, speaker, choose speak/listen language, configure host toggles. |
| Waiting room | `/rooms/[id]/waiting` | Let host approve participants and confirm readiness. |
| Live meeting | `/room/[id]` | Existing realtime meeting surface with host/participant controls. |
| Ended | `/rooms/[id]/ended` | Show transcript finalizing, summary generating, action items queued, feedback CTA. |
| Artifacts | `/rooms/[id]/artifacts` | Review transcript, AI summary, action items, and export package preview. |

## 5. AI Summary And Artifacts

| Artifact | Source | Owner |
|---|---|---|
| Final transcript | Transcript service segments/translations | Host/Workspace Manager |
| AI summary | AI assistant worker after meeting ends | Host/Workspace Manager |
| Decisions | AI summary structured output | Host/Workspace Manager |
| Action items | AI summary structured output | Host/Workspace Manager |
| Recording/export files | TranslationRoom recordings and transcript exports | Workspace Manager/Owner |
| Feedback | Post-room feedback form | Host/Workspace Manager |

Recommended summary states: `queued`, `processing`, `ready`, `failed`, `approved`, `published`.

## 6. Backend And AI Expansion Notes

| Area | Existing Base | B2B Expansion Needed |
|---|---|---|
| Auth/RBAC | Users, roles, permissions, workspaces | Workspace membership APIs, invitation flow, role-aware redirects. |
| Rooms | Room lifecycle, participants, feedback | Room preflight endpoint, waiting-room state, artifact permissions. |
| Transcript | Transcripts, segments, translations, glossary | Workspace-scoped search, export jobs, correction workflow. |
| AI | STT, translation, TTS, AI assistant workers | Summary job status, structured actions/decisions, failure retry surface. |
| Notification | Preferences | Invites, summary-ready alerts, failed-job alerts, billing alerts. |
| Subscription | Schema design | Plan, credits, usage, invoices, workspace billing APIs. |
| Internal admin | Basic admin preview | Tenant management, support audit view, AI ops monitoring. |

## 7. Implementation Phases

| Phase | Focus |
|---|---|
| 1 | Split B2B dashboard routes and preserve legacy redirects. |
| 2 | Build frontend-preview meeting flow from room creation to artifacts. |
| 3 | Connect room preflight/setup/waiting pages to backend contracts. |
| 4 | Add workspace manager governance: members, artifacts, terminology, usage. |
| 5 | Add internal WarpTalk admin: tenants, AI ops, support, plans. |
| 6 | Harden RBAC, audit logs, retention, exports, and notification delivery. |

## 8. Current Defaults

- `/host/dashboard` is the default post-login route while backend auth is incomplete.
- `/dashboard`, `/workspace`, and `/admin` remain available only as redirects.
- Meeting v1 uses preview data so screens can be reviewed without backend availability.
- Live meeting remains at `/room/[id]`; management and post-meeting pages use `/rooms/[id]/*`.
