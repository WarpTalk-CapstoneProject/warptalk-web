const baseUrl = process.env.WARPTALK_BASE_URL ?? "http://localhost:3000";

const expectedOkRoutes = [
  "/host/dashboard",
  "/participant/dashboard",
  "/participant/meetings",
  "/participant/summaries",
  "/participant/ai-chat",
  "/participant/settings",
  "/workspace/dashboard",
  "/workspace/members",
  "/workspace/rooms",
  "/workspace/artifacts",
  "/workspace/terminology",
  "/workspace/billing",
  "/workspace/settings",
  "/internal/dashboard",
  "/internal/workspaces",
  "/internal/users",
  "/internal/plans",
  "/internal/ai-ops",
  "/internal/support",
  "/internal/settings",
  "/join?code=WARP-241",
  "/rooms",
  "/rooms/create",
  "/rooms/preview-investor-qa",
  "/rooms/preview-investor-qa/setup",
  "/rooms/preview-investor-qa/waiting",
  "/rooms/preview-investor-qa/ended",
  "/rooms/preview-investor-qa/artifacts",
  "/history",
  "/ai-summaries",
  "/ai-chat",
  "/terminology",
  "/voice-profiles",
  "/feedback",
  "/settings",
];

const expectedRedirectRoutes = [
  "/dashboard",
  "/workspace",
  "/admin",
];

const expectedNotFoundRoutes = [
  "/this-route-does-not-exist",
  "/dashboard/unknown-page",
  "/rooms/not-real/unknown-page",
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

  for (const route of expectedRedirectRoutes) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
    const passed = response.status === 307 || response.status === 308;
    const mark = passed ? "PASS" : "FAIL";
    console.log(`${mark} ${route} expected redirect, got ${response.status}`);

    if (!passed) {
      throw new Error(`${route} expected redirect, got ${response.status}`);
    }
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
