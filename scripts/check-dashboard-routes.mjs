const baseUrl = process.env.WARPTALK_BASE_URL ?? "http://localhost:3000";

const expectedOkRoutes = [
  "/dashboard",
  "/rooms",
  "/history",
  "/ai-summaries",
  "/ai-chat",
  "/terminology",
  "/voice-profiles",
  "/feedback",
  "/settings",
];

const expectedNotFoundRoutes = [
  "/this-route-does-not-exist",
  "/dashboard/unknown-page",
  "/rooms/not-real",
];

async function checkRoute(route, expectedStatus) {
  const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
  const passed = response.status === expectedStatus;
  const mark = passed ? "PASS" : "FAIL";
  console.log(`${mark} ${route} expected ${expectedStatus}, got ${response.status}`);

  if (!passed) {
    throw new Error(`${route} expected ${expectedStatus}, got ${response.status}`);
  }
}

async function main() {
  console.log(`Checking dashboard routes at ${baseUrl}`);

  for (const route of expectedOkRoutes) {
    await checkRoute(route, 200);
  }

  for (const route of expectedNotFoundRoutes) {
    await checkRoute(route, 404);
  }
}

main().catch((error) => {
  console.error(error.message);
  console.error("Make sure the dev server is running before this check, for example: npm run dev");
  process.exit(1);
});
