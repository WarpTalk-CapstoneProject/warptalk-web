"use client";

/**
 * The reader's side of a share link.
 *
 * WHAT THIS PAGE IS ALLOWED TO BE
 *   One document, read-only, for somebody who may have no account. It renders with the same
 *   `MinutesDocument` the room uses, so what the host saw when they shared is what the recipient
 *   sees — a second, simplified renderer here would quietly become a different document.
 *
 * WHY THE THREE FAILURES READ DIFFERENTLY
 *   404 — no such live link. Revoked, expired and never-existed are one answer on the server, and
 *         the page says exactly that much: this address does not open anything now.
 *   401 — the link is restricted and nobody is signed in. That is a sign-in, not a refusal: an
 *         invited person clicking their own link has done nothing wrong.
 *   403 — signed in, and not on the list. The only honest thing to say is who to ask.
 *   400 — the link is fine and the DOCUMENT is not: still a draft, and a draft is not published.
 *         Said as its own sentence because "you do not have access" would send the reader back to
 *         the host over something the host has not done yet rather than over permission.
 *
 * WHAT IT DELIBERATELY DOES NOT OFFER
 *   No seek-to-transcript control, because a shared reader has no transcript and a citation that
 *   goes nowhere is worse than one printed as plain text. No editing, no approval, no action
 *   items — those belong to the meeting, and this is a copy of its record.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { DownloadSimple, FilePdf, Spinner } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MinutesDocument } from "@/components/rooms/minutes-document";
import { resolveMinutesTemplate, type MinutesTemplateId } from "@/lib/meeting/minutes-document";
import { meetingMinutesService } from "@/services/meeting-minutes.service";
import { parseMinutesContent } from "@/types/meetingMinutes";
import type { SharedMinutes } from "@/types/minutesShare";

const DOCUMENT_STATUS: Record<string, string> = {
  DRAFT: "Draft — not signed and not approved",
  IN_REVIEW: "Signed by the secretary — not yet approved by the chair",
  APPROVED: "Approved",
};

/** Edits are impossible here, so the handlers exist only to satisfy the document's contract. */
const NO_EDITS = {
  setAgenda: () => {},
  setNotes: () => {},
  setSectionText: () => {},
  setItemText: () => {},
};

export function SharedMinutesView({ token }: { token: string }) {
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-minutes", token],
    retry: false,
    queryFn: async (): Promise<SharedMinutes> =>
      (await meetingMinutesService.getShared(token)).data,
  });

  const content = data ? parseMinutesContent(data.minutes.content) : null;

  // The same default the app itself opens with — the layout does not follow the meeting's
  // language, and a recipient who needs the other one downloads it. Derived rather than stored:
  // there is nothing on this page that could change it afterwards.
  const template: MinutesTemplateId = resolveMinutesTemplate();

  async function download(format: "docx" | "pdf") {
    setDownloading(format);
    try {
      const response = await meetingMinutesService.downloadShared(token, format);
      const disposition = String(response.headers?.["content-disposition"] ?? "");
      const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = named
        ? decodeURIComponent(named)
        : `${data?.minutes.minutesNo ?? "minutes"}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      const status = isAxiosError(downloadError) ? downloadError.response?.status : undefined;
      toast.error(
        status === 503
          ? "PDF conversion is unavailable here. The Word file still downloads."
          : "Could not download this document.",
      );
    } finally {
      setDownloading(null);
    }
  }

  if (isLoading) {
    return <Centred>Opening the document…</Centred>;
  }

  if (error || !data || !content) {
    const status = isAxiosError(error) ? error.response?.status : undefined;

    if (status === 401) {
      return (
        <Centred title="Sign in to read this">
          This document was shared with named people. Sign in with the address it was sent to, then
          open the link again.
        </Centred>
      );
    }

    if (status === 400) {
      return (
        <Centred title="This document is not signed yet">
          The link works, but the minutes behind it are still a draft. They open the moment the
          host or the secretary signs them — nobody has to send you a new address.
        </Centred>
      );
    }

    if (status === 403) {
      return (
        <Centred title="You do not have access to this document">
          It was shared with named people and your account is not one of them. Ask whoever sent the
          link to add you.
        </Centred>
      );
    }

    return (
      <Centred title="This link does not open anything">
        It may have been revoked by the person who shared it, or it may have expired. Ask them for a
        new one.
      </Centred>
    );
  }

  return (
    <div className="min-h-screen bg-surface-2 py-6">
      <div className="mx-auto w-full max-w-[900px] px-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div>
            <p className="text-[13px] font-semibold text-ink">{data.minutes.minutesNo}</p>
            <p className="text-[11.5px] text-ink-subtle">
              Shared copy — read only.{" "}
              {data.accessMode === "ANYONE_WITH_LINK"
                ? "Anyone holding this address can read it."
                : "Shared with named people."}
            </p>
          </div>

          {/* Absent entirely when the host turned downloads off, rather than shown disabled: a
              greyed button invites somebody to ask why, and the answer is not theirs to change. */}
          {data.allowDownload ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => download("docx")}
                disabled={downloading !== null}
                className="h-8 rounded-md text-[11px] shadow-none"
              >
                {downloading === "docx" ? (
                  <Spinner size={13} className="animate-spin" />
                ) : (
                  <DownloadSimple size={13} />
                )}
                Word
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => download("pdf")}
                disabled={downloading !== null}
                className="h-8 rounded-md text-[11px] shadow-none"
              >
                {downloading === "pdf" ? (
                  <Spinner size={13} className="animate-spin" />
                ) : (
                  <FilePdf size={13} />
                )}
                PDF
              </Button>
            </div>
          ) : null}
        </div>

        <MinutesDocument
          minutes={data.minutes}
          content={content}
          template={template}
          editing={false}
          edits={NO_EDITS}
          // The letterhead is the workspace's, never WarpTalk's — and a shared reader is served no
          // workspace record, so the document simply carries no letterhead rather than borrowing
          // the vendor's.
          branding={{ name: null, logoUrl: null }}
          policy={{
            recordOwner: data.minutes.secretaryName,
            primaryLanguage: content.primaryLanguage,
            translationLanguages: Object.keys(content.translations ?? {}),
          }}
          showGuides={false}
          statusLabel={DOCUMENT_STATUS[data.minutes.status] ?? data.minutes.status}
        />
      </div>
    </div>
  );
}

function Centred({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-2 px-6">
      <div className="max-w-[420px] text-center">
        {title ? <h1 className="mb-1.5 text-[15px] font-semibold text-ink">{title}</h1> : null}
        <p className="text-[12.5px] leading-relaxed text-ink-subtle">{children}</p>
      </div>
    </div>
  );
}
