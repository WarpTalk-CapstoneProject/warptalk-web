# UI/UX MASTER HOTFIX PLAN (Date: 28/07)

## 1. Overview
This document consolidates all UI/UX issues, layout bugs, and visual enhancements identified during testing on **28/07** for the `warptalk-web` application. All hotfixes will be implemented incrementally and tracked within this master specification.

---

## 2. Consolidated Hotfix Items

### Item #1: Exclude Current Host/User from "Suggested Workspace Members" Picker
- **Problem**: When a host opens the "Invite People" picker during meeting/room creation (`src/components/rooms/create/invite-people-picker.tsx`), the host's own account is suggested in the "Suggested Workspace Members" list.
- **Solution**: Inject `useAuth()` into `InvitePeoplePicker` and filter out the current user (`m.email !== user?.email && m.userId !== user?.id`).
- **Affected Component**:
  - `src/components/rooms/create/invite-people-picker.tsx`

---

### Item #2: Re-opening Chatbot Widget when Clicking "Ask WarpBot"
- **Problem**: When the Chatbot popover/widget is closed or minimized (`src/components/layout/global-chatbot.tsx`), clicking the trigger button does not reliably restore/re-open the chatbot window because `isMinimized` is not reset and controlled popover state gets out of sync.
- **Solution**: Add explicit `onClick` to `PopoverTrigger` to reset `setIsMinimized(false)` and force `setIsOpen(true)` when clicked.
- **Affected Component**:
  - `src/components/layout/global-chatbot.tsx`

---

### Item #3: Rename Chatbot Button Label to "Ask WarpBot"
- **Problem**: The chatbot trigger button in the global bottom bar (`src/components/layout/global-chatbot.tsx`) displays "Ask WarpTalk".
- **Solution**: Rename label and `aria-label` from "Ask WarpTalk" to "Ask WarpBot".
- **Affected Component**:
  - `src/components/layout/global-chatbot.tsx`

---

### Item #4: Fix Ambient Assistant Page Context Showing Stale "ended" Status for Ongoing Meetings
- **Problem**: When a user is in an active live meeting (`src/app/(app)/room/[id]/page.tsx`), the assistant ambient page context badge displays `Live meeting ... ended` because `snapshot.status` directly reads `room.status` from the room query instead of reflecting the active meeting state.
- **Solution**: Override `snapshot.status` to `"live"` (or `"active"`) while the user is in an active meeting session (`pageType: "in_meeting"`).
- **Affected Component**:
  - `src/app/(app)/room/[id]/page.tsx`

---

### Item #5: Fix Approved Document Visibility for External Uploaders & Display Uploader/Approver Avatars
- **Problem 1**: When an External member uploads a document and the Workspace Owner approves it, `DocumentAccessEvaluator.cs` denies view access to External members for non-meeting documents, causing approved documents to disappear for the uploader even after F5 refresh.
- **Problem 2**: The Document management page does not display who uploaded the document or who approved it.
- **Solution 1 (Backend)**: Update `DocumentAccessEvaluator.cs` so document uploaders/owners (`isDocOwner = document.OwnerId == userId || document.UploadedBy == userId`) can always view their own uploaded documents.
- **Solution 2 (Backend & Frontend)**: Include `UploadedBy` and `ApprovedBy` actor fields in `WorkspaceDocumentDto` and render Uploader and Approver avatars/badges in `documents/page.tsx`.
- **Affected Components**:
  - Backend: `WarpTalk.WorkspaceService.Application/Evaluators/DocumentAccessEvaluator.cs`
  - Backend: `WarpTalk.WorkspaceService.Application/DTOs/WorkspaceDocument/WorkspaceDocumentDto.cs`
  - Frontend: `src/app/(app)/[workspaceSlug]/documents/page.tsx`

---

### Item #6: Missing UI/UX for Global Glossary Management (CRUD) & App-Level AI Model Integration
- **Problem**: 
  1. The application currently lacks a dedicated, user-friendly UI (CRUD view/modal) for managing **Global Glossary** terms (custom terminologies, brand jargon, and preferred translations).
  2. Global Glossary terms are not systematically applied at the application level to **Translation Models** (Live STT / Translation prompt context) and **AI Assistant Models** (WarpBot / `AIAssistantWorker` retrieval).
- **Solution**:
  1. **Frontend UI**: Implement a full Global Glossary CRUD management interface under Workspace Settings (`src/app/(app)/[workspaceSlug]/settings/glossary/page.tsx` or setting modal), allowing users to view, search, add, edit, delete, and bulk-import terms via `GlobalGlossaryService`.
  2. **App-Level Model Application**: Wire Global Glossary term retrieval into the application pipeline for **Translation Models** (providing prompt hints / dictionary overrides during live meeting transcription and translation) and **AI Assistant Models** (`WarpBot` / `AIAssistantWorker` context augmentation).
- **Affected Components**:
  - Frontend: `src/app/(app)/[workspaceSlug]/settings/glossary/page.tsx`
  - Frontend: `src/services/global-glossary.service.ts`
  - Frontend/Navigation: `src/components/layout/linear-sidebar.tsx` (or settings sub-navigation)
  - Backend & AI Pipeline: `WarpTalk.TranscriptService`, `AIAssistantWorker`, `chat_tools`

---

### Item #7: [Pending User Feedback / Next Issue]
*(Additional UI/UX hotfix items discovered during testing will be added here)*

---

## 3. Verification & Acceptance Criteria
1. **Item #1**: Open "Invite People" picker when creating a room and verify current host account does NOT appear in "Suggested Workspace Members".
2. **Item #2**: Minimize/close Chatbot widget and click trigger button to verify window reliably re-opens every time.
3. **Item #3**: Verify trigger button label displays "Ask WarpBot".
4. **Item #4**: Join an active live meeting and open Chatbot to verify ambient context displays status `live` instead of `ended`.
5. **Item #5**: Approve an external member's uploaded document and verify the document remains visible after F5, displaying Uploader and Approver avatars.
6. **Item #6**: 
   - Navigate to Workspace Settings -> Glossary and verify full CRUD capabilities (Create, Read, Update, Delete, Search) for Global Glossary terms.
   - Verify active Global Glossary terms are injected into Translation and AI Assistant model prompts.
7. Run Next.js build (`npm run build`) and backend build to ensure zero compilation errors.
