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
  ["billing service", billingService, "} catch {\n      return {"],
  ["billing service", billingService, "} catch {\n      return [];"],
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

// Stripe returns customers to these two paths — Stripe__SuccessUrl and Stripe__CancelUrl in
// deploy/production/app.compose.yml. Nothing inside the app links to the cancel page any
// more, so a routing audit reads it as a stale unslugged duplicate of
// /{slug}/payment/plans. It is not: deleting it 404s anyone who abandons a checkout.
for (const stripeLandingPage of [
  "src/app/workspace/payment/success/page.tsx",
  "src/app/workspace/payment/plans/page.tsx",
]) {
  if (!fs.existsSync(stripeLandingPage)) {
    failures.push(
      `${stripeLandingPage} is a Stripe return URL; removing it breaks checkout in production`,
    );
  }
}
for (const marker of ["createCheckoutSession:", "getCheckoutSession:"]) {
  if (!billingService.includes(marker)) {
    failures.push(`billingService is missing merged checkout operation: ${marker}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Production billing surface contract passed.");
