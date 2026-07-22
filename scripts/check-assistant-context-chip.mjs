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
  ["input placeholder changes when page context is attached", chatbot.includes('Ask with page context...')],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
