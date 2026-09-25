"use client";

/**
 * The Email templates library — cards with real thumbnails and the "as received" preview —
 * rendered from fixtures, so it can be judged in both themes without a notification service.
 *
 * Fixtures only; /dev is 404 in production (`src/app/dev/layout.tsx` and the proxy).
 */

import { useState } from "react";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { CmsCardGrid } from "@/components/admin/cms/cms-shared";
import { DEFAULT_INBOX_STATE, EmailInboxPreviewPanel, type InboxPreviewState } from "@/components/admin/cms/email-inbox-preview";
import { EmailSendDialog } from "@/components/admin/cms/email-send-dialog";
import { EmailTemplateCard } from "@/components/admin/cms/email-template-card";
import { EmailTemplateWizard } from "@/components/admin/cms/email-template-wizard";
import { EmailThumbnailFrame } from "@/components/admin/cms/email-thumbnail";
import { Button } from "@/components/ui/button";

import { FIXTURE_TEMPLATES, renderFixture } from "./fixtures";

const noop = () => undefined;

export default function EmailTemplatesPreviewPage() {
  const [opened, setOpened] = useState<string>("auth.verify-email");
  const [state, setState] = useState<InboxPreviewState>(DEFAULT_INBOX_STATE);
  const [wizard, setWizard] = useState(false);
  const [sending, setSending] = useState(false);
  const archived = { ...FIXTURE_TEMPLATES[2], key: "summer-sale", name: "Summer sale", status: "DELETED", deleteReason: "Campaign over", isLive: false };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Dev preview"
        title="Email templates library"
        description="Fixtures: thumbnails, cards and the as-received preview. The wizard's layout step and the send estimate need the API."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setSending(true)}>Send email dialog</Button>
            <Button size="sm" onClick={() => setWizard(true)}>New template wizard</Button>
          </>
        }
      />
      <EmailTemplateWizard open={wizard} onOpenChange={setWizard} takenKeys={new Set(FIXTURE_TEMPLATES.map((t) => t.key))} />
      <EmailSendDialog open={sending} onOpenChange={setSending} template={FIXTURE_TEMPLATES[2]} />
      <section className="mt-6">
        <CmsCardGrid>
          {[...FIXTURE_TEMPLATES, archived].map((template) => (
            <EmailTemplateCard
              key={template.key}
              template={template}
              selected={false}
              onSelect={noop}
              canSend
              thumbnail={
                <EmailThumbnailFrame
                  html={renderFixture(template.key, "en", false).html}
                  label={template.name}
                  onOpen={() => setOpened(template.key)}
                  height={180}
                />
              }
              actions={{
                onPreview: () => setOpened(template.key),
                onSendTest: noop,
                onReset: noop,
                onArchiveAll: noop,
                onDelete: noop,
                onRestore: noop,
                onSendEmail: noop,
              }}
            />
          ))}
        </CmsCardGrid>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[14px] font-semibold">As received — {opened}</h2>
        <AdminPanel className="flex max-h-[900px] flex-col">
          <EmailInboxPreviewPanel
            title={FIXTURE_TEMPLATES.find((t) => t.key === opened)?.name ?? opened}
            rendered={renderFixture(opened, state.locale, state.dark)}
            loading={false}
            error={false}
            state={state}
            onState={setState}
            sampleSets={[
              { id: "00000000-0000-0000-0000-000000000000", name: "Default", values: {}, builtIn: true, updatedAt: null },
              { id: "b1", name: "Long Vietnamese name", values: {}, builtIn: false, updatedAt: null },
            ]}
            actions={
              <>
                <Button variant="outline" size="sm">Open in new tab</Button>
                <Button variant="outline" size="sm">Send test</Button>
                <Button size="sm">Edit</Button>
              </>
            }
          />
        </AdminPanel>
      </section>
    </AdminPage>
  );
}
