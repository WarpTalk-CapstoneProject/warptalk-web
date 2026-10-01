/**
 * W4a: which windows report their sign-in state to the desktop shell (`reportSignedIn`).
 *
 * Every page of the main window, signed in or not — /login included, which is where a signed-out
 * window sits — and not the popup over Google Meet (`/desktop-transcript/...`): that window shares
 * the main window's storage and therefore its answer, and the desktop asks the main window.
 *
 * Pure, so it is tested with the plain node runner.
 */
export function shouldReportDesktopSignedIn(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return !(pathname === "/desktop-transcript" || pathname.startsWith("/desktop-transcript/"));
}
