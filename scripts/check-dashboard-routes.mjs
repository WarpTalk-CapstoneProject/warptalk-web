const baseUrl = process.env.WARPTALK_BASE_URL ?? "http://localhost:3000";

const publicRoutes = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/join?code=WARP-241",
  "/workspace/payment/plans",
];

const privateRoutes = [
  "/workspace",
  "/acme/dashboard",
  "/acme/members",
  "/acme/rooms",
  "/acme/billing",
  "/billing",
  "/ai-chat",
  "/room/00000000-0000-0000-0000-000000000000",
];

const authenticatedRoutes = [
  "/workspace",
  "/workspace/create",
  "/acme/dashboard",
  "/acme/members",
  "/acme/rooms",
  "/acme/billing",
  "/billing",
  "/billing/plans",
  "/ai-chat",
  "/room/00000000-0000-0000-0000-000000000000",
  "/voice-profiles",
];

const authenticatedNotFoundRoutes = [
  "/this-route-does-not-exist",
  "/acme/unknown-page",
];

async function request(route, authenticated = false) {
  return fetch(`${baseUrl}${route}`, {
    redirect: "manual",
    headers: authenticated
      ? { cookie: "access_token=route-contract-placeholder" }
      : undefined,
  });
}

function assert(condition, message) {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`Checking route and authentication contracts at ${baseUrl}`);

  for (const route of publicRoutes) {
    const response = await request(route);
    assert(response.status === 200, `${route} is public (got ${response.status})`);
  }

  for (const route of privateRoutes) {
    const response = await request(route);
    const location = response.headers.get("location") ?? "";
    assert(
      [307, 308].includes(response.status) &&
        location.includes("/login") &&
        location.includes("redirect="),
      `${route} redirects unauthenticated users to login (got ${response.status} ${location})`,
    );
  }

  for (const route of authenticatedRoutes) {
    const response = await request(route, true);
    assert(
      response.status === 200,
      `${route} exists for authenticated users (got ${response.status})`,
    );
  }

  for (const route of authenticatedNotFoundRoutes) {
    const response = await request(route, true);
    assert(
      response.status === 404,
      `${route} remains not found after authentication (got ${response.status})`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  console.error(
    "Make sure the production or development server is running, for example: npm run dev",
  );
  process.exit(1);
});
