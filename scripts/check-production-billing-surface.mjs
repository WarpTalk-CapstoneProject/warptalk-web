import fs from "node:fs";

const billingPage = fs.readFileSync(
  "src/app/(app)/[workspaceSlug]/billing/page.tsx",
  "utf8",
);
const billingService = fs.readFileSync(
  "src/services/billing.service.ts",
  "utf8",
);
const paymentSuccessPage = fs.readFileSync(
  "src/app/workspace/payment/success/page.tsx",
  "utf8",
);

const forbidden = [
  ["billing page", billingPage, "Simulate STT/TTS processing"],
  ["billing page", billingPage, "Simulated 25 cr deduction"],
  ["billing page", billingPage, "Simulated 50 cr deduction"],
  ["billing page", billingPage, "Simulated 125 cr deduction"],
  ["billing service", billingService, "consumeCredits:"],
  ["billing service", billingService, "/consume"],
  ["billing service", billingService, "/topup"],
  ["payment success page", paymentSuccessPage, '|| "CreditTopUp"'],
  ["payment success page", paymentSuccessPage, "amountPaid === 190000"],
  ["payment success page", paymentSuccessPage, "amountPaid / 8"],
  ["payment success page", paymentSuccessPage, "amountPaid / 10"],
];

const failures = forbidden
  .filter(([, source, marker]) => source.includes(marker))
  .map(
    ([label, , marker]) =>
      `${label} still exposes simulation or masks billing API failures: ${marker}`,
  );

if (fs.existsSync("src/services/payment.service.ts")) {
  failures.push("checkout must be owned by billingService; standalone payment.service.ts is forbidden");
}
for (const marker of ["createInvoiceCheckout:", "getCheckoutSession:"]) {
  if (!billingService.includes(marker)) {
    failures.push(`billingService is missing merged checkout operation: ${marker}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Production billing surface contract passed.");
