import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [layout, sidebar] = await Promise.all([
  readFile(path.join(root, "src/app/(app)/layout.tsx"), "utf8"),
  readFile(path.join(root, "src/components/layout/linear-sidebar.tsx"), "utf8"),
]);

const checks = [
  ["closed sidebar keeps a 64px rail", layout.includes("collapsedWidth={64}")],
  ["panel animates to its collapsed width", layout.includes("open ? width : collapsedWidth")],
  ["collapsed rail remains interactive", layout.includes("collapsedWidth === 0 && !open")],
  // Was pinned to `collapsed={!leftSidebarOpen}`, which is what made the collapse look broken:
  // that swaps LinearSidebar's two trees the instant the flag flips, while the panel beside it
  // spends 420ms tweening the width — so every label vanished at once and only then did the
  // sidebar slide shut. The rail state is now derived from the same flag through a delay that is
  // shorter than the tween, so the swap happens while the panel is still moving. What has to
  // stay true is that the rail follows the sidebar flag and lags it only on the way closed.
  ["sidebar receives its collapsed state", layout.includes("<LinearSidebar collapsed={railCollapsed}") && layout.includes("useRailSwapDelay(leftSidebarOpen,")],
  ["the rail swap lags the close and never the open", /if \(open\) \{\s*\n\s*setCollapsed\(false\);\s*\n\s*return;/.test(layout) && layout.includes("setTimeout(() => setCollapsed(true), delayMs)")],
  ["collapsed navigation keeps icon labels accessible", sidebar.includes("aria-label={collapsed ? item.label : undefined}")],
  ["collapsed navigation hides only visible text", sidebar.includes("{!collapsed && (")],
  ["sidebar rail uses the compact width", sidebar.includes('collapsed ? "w-16" : "w-[224px]"')],
  ["collapsed active icon uses a gray circle", sidebar.includes('collapsed && "mx-auto size-9 justify-center rounded-full px-0"') && sidebar.includes('? "bg-surface-3 text-ink"')],
  ["collapsed active icon has no one-sided indicator", !sidebar.includes("inset_2px_0_0")],
  ["collapsed rail preserves meeting search", sidebar.includes('aria-label="Search meetings"')],
  ["collapsed rail preserves team invite", sidebar.includes('aria-label="Invite team members"')],
  ["toggle announces the resulting action", layout.includes('leftSidebarOpen ? "Collapse sidebar" : "Expand sidebar"')],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
if (failures.length > 0) process.exitCode = 1;
