"use client";

/**
 * The notification panel, rendered against fixtures and over a busy page.
 *
 * WHY IT EXISTS
 *   The real panel needs a session and a notification history, so the only way to look at it
 *   has been to deploy. It is also frosted glass: what it looks like depends on what is BEHIND
 *   it, which an empty page would hide. So it floats over a copy of the Voice Profiles layout,
 *   where the bell actually opens.
 *
 * IT IS NOT THE POPOVER
 *   It renders NotificationPanel inside the same NOTIFICATION_GLASS classes the popover uses.
 *   It cannot catch the open/mark-read wiring — scripts/check-notification-center-contract.mjs
 *   pins that — only the look.
 */

import { useEffect, useMemo } from "react";
import { useTheme } from "next-themes";

import { NOTIFICATION_GLASS, NotificationPanel } from "@/components/notifications/notification-panel";
import { VoiceOrb } from "@/components/voice/voice-orb";
import type { NotificationMessageDto } from "@/types/notification";
import { cn } from "@/lib/utils";

const HOUR = 60 * 60 * 1000;
/** Read once at module load, not in render: the fixtures' "1 day ago" is relative to this. */
const LOADED_AT = Date.now();

function fixtures(now: number): NotificationMessageDto[] {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();
  const base = { payloadJson: "{}", isRead: true, readAt: null };
  return [
    {
      ...base,
      id: "n1",
      type: "SUMMARY_READY",
      title: "Summary ready for “Test UI transcript”",
      content: "The summary and transcript for “Test UI transcript” are ready to read.",
      actionUrl: "/dev/notifications-preview",
      createdAt: at(26),
    },
    {
      ...base,
      id: "n2",
      type: "MEETING_INVITED",
      title: "You were invited to “Test Recording 3”",
      content: "You were invited to join “Test Recording 3”.",
      actionUrl: "/dev/notifications-preview",
      payloadJson: JSON.stringify({ roomId: "00000000-0000-0000-0000-000000000003", roomTitle: "Test Recording 3" }),
      createdAt: at(30),
    },
    {
      ...base,
      id: "n3",
      type: "MEETING_STARTED",
      title: "“test daily mode” has started",
      content: "“test daily mode” is live now. Join when you’re ready.",
      actionUrl: "/dev/notifications-preview",
      createdAt: at(31),
    },
    {
      ...base,
      id: "n4",
      type: "MEETING_STARTED",
      title: "“Test Recording 3” has started",
      content: "“Test Recording 3” is live now. Join when you’re ready.",
      actionUrl: "/dev/notifications-preview",
      createdAt: at(50),
    },
    {
      ...base,
      id: "n5",
      type: "MEETING_STARTED",
      title: "“Test Recording For issue” has started",
      content: "“Test Recording For issue” is live now. Join when you’re ready.",
      actionUrl: "/dev/notifications-preview",
      createdAt: at(52),
    },
    {
      ...base,
      id: "n6",
      type: "BILLING_PAYMENT_SUCCEEDED",
      title: "Payment succeeded",
      content: "Your workspace subscription renewed. The receipt is in Settings → Billing.",
      actionUrl: "/dev/notifications-preview",
      createdAt: at(98),
    },
    {
      ...base,
      id: "n7",
      type: "MAINTENANCE",
      title: "Scheduled maintenance on Sunday",
      content:
        "Meetings may disconnect for up to 10 minutes between 02:00 and 02:30 (GMT+7). Nothing you record will be lost.",
      actionUrl: null,
      createdAt: at(140),
    },
  ];
}

const FRESH: ReadonlySet<string> = new Set(["n1", "n2", "n3"]);

const BEHIND = [
  { id: "a", name: "Lien - Gentle Coordinator", detail: "Feminine" },
  { id: "b", name: "Linh - Soft Presence", detail: "Feminine" },
  { id: "c", name: "Minh - Conversational Partner", detail: "Masculine" },
  { id: "d", name: "Xia - Calm Companion", detail: "Feminine" },
  { id: "e", name: "Skylar - Friendly Guide", detail: "Feminine" },
  { id: "f", name: "Daniel - Modern Assistant", detail: "Masculine" },
];

export default function NotificationsPreviewPage() {
  // ?theme=light / ?theme=dark — see voice-profiles-preview for why both have to be looked at.
  const { setTheme } = useTheme();
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("theme");
    if (requested === "light" || requested === "dark") setTheme(requested);
  }, [setTheme]);

  const notifications = useMemo(() => fixtures(LOADED_AT), []);

  return (
    <main className="relative min-h-screen bg-surface-1 text-ink">
      <header className="flex items-center justify-between border-b border-hairline px-6 py-3">
        <span className="text-[13px] text-ink-muted">voice-profiles</span>
        <span className="size-6 rounded-full border border-hairline bg-surface-2" />
      </header>

      {/* The page the glass sits on. Rows and orbs, because blur over an empty page shows nothing. */}
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-6 p-6" aria-hidden>
        <div>
          <p className="mb-1 text-[11px] tracking-[0.08em] text-ink-subtle">LIBRARY VOICES</p>
          {BEHIND.map((voice) => (
            <div key={voice.id} className="flex items-center gap-3 border-b border-hairline py-3 text-[13.5px]">
              <VoiceOrb voiceId={voice.id} />
              {voice.name}
              <span className="ml-auto text-ink-muted">{voice.detail}</span>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="rounded-[14px] border border-hairline p-4 text-[12.5px] leading-relaxed text-ink-muted">
            <p className="mb-1 text-[13px] font-medium text-ink">Voice consent</p>
            We build a voice model from the first recording you give us and dub you in it. That
            model is used only to dub what you say, and is deleted the moment you withdraw this.
            <p className="mt-2 text-destructive">Withdraw</p>
          </div>
          <div className="rounded-[14px] border border-hairline p-4 text-[12.5px] leading-relaxed text-ink-muted">
            <p className="mb-1 text-[13px] font-medium text-ink">Stand-in voice</p>
            Used for a speaker in Vietnamese who has not picked a voice of their own.
          </div>
        </div>
      </div>

      <section aria-label="Notifications" className={cn("absolute top-14 right-6 flex flex-col", NOTIFICATION_GLASS)}>
        <NotificationPanel
          notifications={notifications}
          freshIds={FRESH}
          isLoading={false}
          isError={false}
          onRetry={() => {}}
          onNavigate={() => {}}
        />
      </section>
    </main>
  );
}
