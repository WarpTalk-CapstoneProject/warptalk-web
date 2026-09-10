"use client";

/**
 * The user chip, including the case that is hard to get right: inside a row that is a link.
 *
 * Almost every name in the app sits in something already clickable — an archive row, a meetings
 * list row, a schedule card. The chip has to open its card there WITHOUT the row navigating out
 * from under it, and it has to do that without nesting a <button> inside an <a>, which is invalid
 * HTML. On the real pages that behaviour is behind sign-in, a workspace and a meeting that has
 * already happened; here it is one click.
 *
 * Not linked from anywhere.
 */

import Link from "next/link";

import { UserChip } from "@/components/user/user-chip";

// i18n-allow: these are PEOPLE'S NAMES — the team's own — not UI copy to translate. Real
// Vietnamese names are the case worth previewing, since they are what the chips have to fit.
const NHI = {
  userId: "u2",
  name: "Ngô Xuân Hạnh Nhi",
  email: "nhi@warptalk.io.vn",
  role: "Host",
  speakLanguage: "vi",
  listenLanguage: "en",
};

const TU = {
  userId: "u1",
  // i18n-allow: a person's name, not UI copy.
  name: "Huỳnh Thái Tú",
  email: "tu@warptalk.io.vn",
  role: "Owner",
  status: "Waiting",
};

const UNKNOWN = { userId: "u9", name: "Host", role: "Host" };

export default function UserChipPreviewPage() {
  return (
    <main className="min-h-dvh bg-canvas p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-[18px] font-semibold text-ink">User chip</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Click a name. The card carries the face, the address, the role, the status and — once
            presence resolves, which it will not here — whether they are online.
          </p>
        </div>

        <section className="space-y-2">
          <h2 className="text-[12px] font-medium text-ink-muted">
            Pill, the shape the meetings list uses
          </h2>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-1 p-3">
            <UserChip user={NHI} />
            <UserChip user={TU} size="sm" />
            <UserChip user={UNKNOWN} size="sm" />
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-[12px] font-medium text-ink-muted">
            Text, the shape a dense secondary line uses
          </h2>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-3 text-[11px] text-ink-subtle">
            <span className="flex items-center gap-1">
              WRJ · <UserChip user={NHI} variant="text" size="sm" showAvatar={false} />
            </span>
            <span className="flex items-center gap-1">
              Hosted by <UserChip user={TU} variant="text" size="sm" showAvatar={false} />
            </span>
            <span className="flex items-center gap-1">
              <UserChip user={TU} variant="text" size="sm" />
            </span>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-[12px] font-medium text-ink-muted">
            Inside a link — the card must open and the row must NOT navigate
          </h2>
          <p className="text-[12px] text-ink-muted">
            Clicking anywhere else on the row goes to <code>/dev</code> (a 404). Clicking the chip
            must stay here.
          </p>
          <Link
            href="/dev/this-route-does-not-exist"
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-1 px-4 py-3 text-[13px] transition-colors hover:bg-surface-2"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">
                Weekly sync — daily mode
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-ink-subtle">
                WRJ ·{" "}
                <UserChip
                  user={NHI}
                  variant="text"
                  size="sm"
                  showAvatar={false}
                  className="text-[10px] text-ink-subtle"
                />
              </span>
            </span>
            <UserChip user={NHI} size="md" className="border-border/60" />
          </Link>
        </section>
      </div>
    </main>
  );
}
