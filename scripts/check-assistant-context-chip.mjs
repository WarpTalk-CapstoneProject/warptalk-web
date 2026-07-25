import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chatbot = await readFile(path.join(root, "src/components/layout/global-chatbot.tsx"), "utf8");

const checks = [
  ["ambient context has a display helper", chatbot.includes("getAmbientContextDisplay")],
  ["context chip reads from ambient page context", chatbot.includes("ambientContextDisplay") && chatbot.includes("ambientPageContext")],
  ["chip prefers snapshot title/name label", chatbot.includes("context.snapshot?.title") && chatbot.includes("context.snapshot?.name")],
  ["chip uses context-type icons instead of a green dot", chatbot.includes("PAGE_CONTEXT_ICONS") && chatbot.includes("ambientContextDisplay.icon") && !chatbot.includes('aria-label="Active page context"\n                        title={`${ambientContextDisplay.pageLabel}: ${ambientContextDisplay.title}`}\n                        className="flex min-w-0 flex-1 items-center gap-1.5"\n                      >\n                        <span className="relative flex size-4 shrink-0 items-center justify-center rounded-full bg-[#34c759]/10 ring-1 ring-[#34c759]/20">')],
  ["chip is labelled for screen readers", chatbot.includes('aria-label="Active page context"')],
  ["context can be disabled per active page", chatbot.includes("disabledPageContextKey") && chatbot.includes("setDisabledPageContextKey")],
  ["message sends only visible page context", chatbot.includes("isPageContextVisible") && chatbot.includes("pageContext: effectivePageContext")],
  ["slash commands use effective page context", chatbot.includes("cmd.buildPrompt(effectivePageContext)")],
  ["context chip sits above the editor", chatbot.includes('aria-label="Active page context"') && chatbot.indexOf('aria-label="Active page context"') < chatbot.indexOf("relative z-10")],
  ["context chip has a remove button", chatbot.includes('aria-label="Remove page context"')],
  ["context chip is not embedded in the textarea row", !chatbot.includes('<div className="flex flex-wrap items-center gap-1.5 w-full min-h-[38px] max-h-[120px] bg-transparent px-2 py-1.5 overflow-y-auto">\n                    {ambientContextDisplay &&')],
  ["context composer has a softer gray shell", chatbot.includes("contextComposerShellClassName") && chatbot.includes("bg-surface-2/55")],
  ["input is wider inside the same gray card", chatbot.includes("p-[3px]")],
  ["input gets a subtle shadow when context is active", chatbot.includes("contextInputShellClassName") && chatbot.includes("shadow-[0_1px_2px")],
  ["context shell is tall enough to wrap the input", chatbot.includes("h-[118px]") && chatbot.includes("absolute left-[7px] right-[7px] bottom-2")],
  ["context card animates independently of input", chatbot.includes("relative z-10") && chatbot.includes("absolute left-[7px] right-[7px] bottom-2") && !chatbot.includes("<motion.div\n                  layout")],
  ["context row animates up and down", chatbot.includes('initial={{ opacity: 0, y: -6 }}') && chatbot.includes('exit={{ opacity: 0, y: -6 }}')],
  ["composer icon toggles the gray context card", chatbot.includes("togglePageContextVisibility") && chatbot.includes('aria-label={isPageContextVisible ? "Hide page context" : "Show page context"}')],
  ["composer context toggle is separate from chat resize", chatbot.includes("onClick={() => setIsExpanded(!isExpanded)}") && !chatbot.includes("contextToggleLabel")],
  ["input is wider horizontally", chatbot.includes("'w-[680px] h-[600px]'") && chatbot.includes("'w-[460px] h-[412px]'")],
  ["gray shell hides with page context", chatbot.includes("const isPageContextVisible = Boolean(effectivePageContext)") && chatbot.includes("const contextComposerShellClassName = isPageContextVisible")],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
