import type { Metadata } from "next";

import { SharedMinutesView } from "@/components/rooms/shared-minutes-view";

/**
 * A biên bản opened from a share link.
 *
 * OUTSIDE THE APP SHELL ON PURPOSE
 *   This route lives at the top level rather than under (app): the person opening it may have no
 *   account, no workspace and no session, and wrapping them in a shell built around "your
 *   workspace" would be a sidebar of things they cannot click. They came to read one document.
 *
 * NOT INDEXED
 *   A public link is public to whoever is SENT it, which is not the same thing as published. A
 *   search engine that crawls one of these turns a document somebody forwarded to a client into a
 *   result anybody can find, and no revoke undoes that.
 */
export const metadata: Metadata = {
  title: "Meeting minutes",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SharedMinutesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <SharedMinutesView token={token} />;
}
