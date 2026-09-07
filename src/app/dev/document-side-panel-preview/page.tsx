"use client";

/**
 * The document side panel, inside the scroll container that used to eat its dropdowns.
 *
 * The bug this exists to prove fixed only appears in context: the panel lives in a sidebar that
 * is `lg:overflow-y-auto`, and the old member pickers were absolutely-positioned children of it,
 * so they were clipped by the scroll box however high their z-index. On the real page that is
 * three clicks behind sign-in and a document with policies on it; here the same scroll container
 * is reproduced and the picker can just be opened.
 *
 * Not linked from anywhere.
 */

import { useState } from "react";

import { DocumentSidePanel } from "@/app/(app)/[workspaceSlug]/documents/[documentId]/components/DocumentSidePanel";

// i18n-allow: these are PEOPLE'S NAMES — the team's own — not UI copy to translate. Real
// Vietnamese names are also the case worth previewing, since they are what the chips and the
// picker rows actually have to fit.
const MEMBERS = [
  { userId: "u1", fullName: "Huỳnh Thái Tú", email: "tu@warptalk.io.vn", roleName: "Owner" },
  { userId: "u2", fullName: "Ngô Xuân Hạnh Nhi", email: "nhi@warptalk.io.vn", roleName: "Admin" },
  { userId: "u3", fullName: "Trần Mạnh Tuấn", email: "tuan@warptalk.io.vn", roleName: "Member" },
  {
    userId: "u4",
    fullName: "Guest Reviewer",
    email: "guest@example.com",
    roleName: "Member",
    membershipType: "external",
  },
];

const DOC = {
  id: "3515e768-46f5-4f0c-8caf-f525d1e08bbb",
  status: "PUBLIC",
  sizeBytes: 578,
  fileExtension: ".md",
  ingestionStatus: "COMPLETED",
  uploadedBy: "u1",
  createdAt: "2026-08-21T09:00:00.000Z",
};

const formatBytes = (bytes: number) => `${bytes} Bytes`;

export default function DocumentSidePanelPreviewPage() {
  const [policies, setPolicies] = useState<
    { id: string; subjectType: string; subjectId?: string | null; effect: string }[]
  >([]);
  const [external, setExternal] = useState(false);
  const [locked, setLocked] = useState(false);

  return (
    <main className="min-h-dvh bg-surface-1 p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[18px] font-semibold text-ink">Document side panel</h1>
            <p className="mt-1 text-[13px] text-ink-muted">
              Open a picker and scroll — it must stay on top of the card and outside the
              scroll box.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLocked((value) => !value)}
            className="cursor-pointer rounded-md border border-hairline px-2.5 py-1.5 text-[12px] text-ink-muted transition-colors hover:text-ink"
          >
            {locked ? "Show as owner" : "Show as member (locked)"}
          </button>
        </div>

        {/* The real page's grid and, crucially, its scrolling sidebar. */}
        <div className="grid h-[420px] gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="rounded-xl border border-dashed border-hairline p-6 text-[13px] text-ink-subtle">
            (the document preview sits here)
          </div>

          <div
            data-testid="sidebar-scroller"
            className="flex flex-col gap-6 lg:sticky lg:top-0 lg:max-h-full lg:overflow-y-auto lg:pb-2"
          >
            <DocumentSidePanel
              doc={DOC}
              membersList={MEMBERS}
              formatBytes={formatBytes}
              canManagePolicies={!locked}
              isExternalAllowed={external}
              isSubmitting={false}
              policiesList={policies}
              toggleExternalAccess={async (checked) => setExternal(checked)}
              allowUser={async (userId) =>
                setPolicies((current) => [
                  ...current,
                  { id: `a-${userId}`, subjectType: "User", subjectId: userId, effect: "ALLOW" },
                ])
              }
              blockUser={async (userId) =>
                setPolicies((current) => [
                  ...current,
                  { id: `d-${userId}`, subjectType: "User", subjectId: userId, effect: "DENY" },
                ])
              }
              removePolicy={async (policyId) =>
                setPolicies((current) => current.filter((policy) => policy.id !== policyId))
              }
            />
            {/* Enough height that the sidebar genuinely scrolls, as it does on a real document. */}
            <div className="h-64 shrink-0 rounded-xl border border-dashed border-hairline" />
          </div>
        </div>
      </div>
    </main>
  );
}
