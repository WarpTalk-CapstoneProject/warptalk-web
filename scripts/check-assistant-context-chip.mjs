import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chatbot = await readFile(path.join(root, "src/components/layout/global-chatbot.tsx"), "utf8");

const checks = [
  ["ambient context has a display helper", chatbot.includes("getAmbientContextDisplay")],
  ["context chip reads from ambient page context", chatbot.includes("ambientContextDisplay") && chatbot.includes("ambientPageContext")],
  ["chip prefers snapshot title/name label", chatbot.includes("context.snapshot?.title") && chatbot.includes("context.snapshot?.name")],
  ["chip renders a Linear-style green status dot", chatbot.includes("bg-[#34c759]") && chatbot.includes("ring-[#34c759]/20")],
  ["chip is labelled for screen readers", chatbot.includes('aria-label="Active page context"')],
  ["context can be disabled per active page", chatbot.includes("disabledPageContextKey") && chatbot.includes("setDisabledPageContextKey")],
  ["message sends only effective page context", chatbot.includes("effectivePageContext") && chatbot.includes("pageContext: effectivePageContext")],
  ["slash commands use effective page context", chatbot.includes("cmd.buildPrompt(effectivePageContext)")],
  ["context chip sits above the editor", chatbot.includes('aria-label="Active page context"') && chatbot.indexOf('aria-label="Active page context"') < chatbot.indexOf('className="relative rounded-[8px] border border-border bg-surface-1"')],
  ["context chip has a remove button", chatbot.includes('aria-label="Remove page context"')],
  ["context chip is not embedded in the textarea row", !chatbot.includes('<div className="flex flex-wrap items-center gap-1.5 w-full min-h-[38px] max-h-[120px] bg-transparent px-2 py-1.5 overflow-y-auto">\n                    {ambientContextDisplay &&')],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
