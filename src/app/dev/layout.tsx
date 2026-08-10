import { notFound } from "next/navigation";

/**
 * Everything under /dev is a developer preview and must never be reachable from a
 * production build.
 *
 * `src/proxy.ts` already 404s the `/dev` prefix in production, but that guarantee lives
 * entirely in one matcher in one file: anything that narrows the matcher, renames the
 * proxy, or serves these pages without it puts the preview back on the public origin. The
 * page it protects reflects attacker-controlled query parameters (workspace name, inviter
 * name, email) inside WarpTalk branding next to a live "Accept & Join Workspace" button,
 * which is a phishing page pre-hosted on our own domain. That deserves a second,
 * independent gate that travels with the route itself.
 */
export default function DevOnlyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <>{children}</>;
}
