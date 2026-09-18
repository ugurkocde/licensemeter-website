import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://client.crisp.chat/l.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "/* Isolated chat service for browser tests. */",
    }),
  );
  await page.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.turnstile = { render: function(element, options) { window.__verifySupport = function() { options.callback("test-token"); }; window.__verifySupport(); return "widget"; }, reset: function() { window.__verifySupport(); }, remove: function() {} };`,
      }),
  );
});

const openDemo = async (page: Page) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open the sample tenant" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app$/);
};

test("AI demo pages show current sample costs and members without API keys", async ({
  page,
}) => {
  await openDemo(page);
  const content = page.locator("#content");
  await page.goto("/app/ai-costs");
  await expect(
    content.getByRole("complementary", { name: "Sample data notice" }),
  ).toBeVisible();
  await expect(
    content.getByText("Total AI spend this month", { exact: true }),
  ).toBeVisible();
  await expect(
    content.getByRole("img", { name: /Daily API spend over 60 days/ }),
  ).toBeVisible();
  await expect(
    content.locator('a[download="licensemeter-ai-spend-sample.csv"]'),
  ).toBeVisible();
  await expect(
    content.getByRole("button", { name: "Sync now", exact: true }),
  ).toHaveCount(0);
  for (const provider of ["openai", "anthropic"]) {
    await page.goto(`/app/connectors/${provider}`);
    await expect(
      content.getByRole("complementary", { name: "Sample data notice" }),
    ).toBeVisible();
    await expect(content.getByText(/No live connection/)).toBeVisible();
    await expect(
      content.getByRole("heading", {
        name: "Sample console members",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      content.getByRole("img", { name: /Daily API spend over 60 days/ }),
    ).toBeVisible();
    await expect(content.getByRole("textbox")).toHaveCount(0);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
});

test("connectors are discoverable from the sidebar with branded cards and mobile search", async ({
  page,
}) => {
  await openDemo(page);
  const nav = page.getByRole("navigation", {
    name: "Workspace navigation",
    exact: true,
  });
  await nav.getByRole("link", { name: "Connectors", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/connectors$/);
  await expect(
    nav.getByRole("link", { name: "Connectors", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".connector-tile")).toHaveCount(9);
  await expect(page.locator(".connector-tile img")).toHaveCount(9);
  await expect(page.getByText("Sample data", { exact: true })).toHaveCount(9);
  await page.getByRole("button", { name: "AI & usage", exact: true }).click();
  await expect(page.locator(".connector-tile")).toHaveCount(4);
  await page
    .getByRole("searchbox", { name: "Search connectors" })
    .fill("Claude");
  await expect(
    page.getByRole("link", { name: "Explore connector: Claude", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search connectors" })
    .fill("does not exist");
  await expect(
    page.getByRole("heading", { name: "No connectors found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all connectors" }).click();
  await expect(page.locator(".connector-tile")).toHaveCount(9);
  await page
    .getByRole("link", { name: "Explore connector: Adobe", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/connectors\/adobe$/);
  await expect(
    nav.getByRole("link", { name: "Connectors", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    nav.getByRole("link", { name: "Settings", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Connectors", exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Mobile workspace navigation" })
    .getByRole("link", { name: "Connectors", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open menu", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
});

test("old connector bookmarks retain query parameters and settings no longer contains the directory", async ({
  page,
}) => {
  await openDemo(page);
  for (const provider of [
    "microsoft",
    "adobe",
    "zoom",
    "atlassian",
    "salesforce",
    "openai",
    "anthropic",
    "chatgpt",
    "claude",
  ]) {
    const response = await page.request.get(
      `/app/settings/${provider}?source=bookmark`,
    );
    expect(response.status()).toBe(200);
    expect(new URL(response.url()).pathname).toBe(
      `/app/connectors/${provider}`,
    );
    expect(new URL(response.url()).searchParams.get("source")).toBe("bookmark");
  }
  await page.goto("/app/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Connectors", exact: true }),
  ).toHaveCount(0);
});

test("sample dashboard exposes the action-first overview and renewal calendar", async ({
  page,
}) => {
  // Next's dev server canonicalizes form redirects to localhost. Starting on
  // that host keeps the demo session cookie on the same origin.
  await openDemo(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Overview" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", {
        name: "Verified savings (30d): what this means",
      })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Next best actions" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Renewals" }).first().click();
  await expect(page).toHaveURL(/\/app\/renewals$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Renewals" }),
  ).toBeVisible();
  await expect(page.getByText("Microsoft Customer Agreement")).toBeVisible();
  await expect(
    page.getByText(/Decision due in|Notice deadline/).first(),
  ).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("portfolio and malformed finding routes recover inside the app shell", async ({
  page,
}) => {
  await openDemo(page);
  await page.goto("/app/portfolio");
  await expect(
    page.getByRole("heading", { level: 1, name: "Portfolio" }),
  ).toBeVisible();
  await expect(page.getByText("One workspace connected")).toBeVisible();

  await page.goto("/app/findings/not-a-real-id");
  await expect(
    page.getByRole("heading", { level: 1, name: "Not found" }),
  ).toBeVisible();
  await expect(page.getByText(/failed to load/i)).toHaveCount(0);
});

test("dense dashboard pages do not overflow a 320px viewport", async ({
  page,
}) => {
  await openDemo(page);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of [
    "/app",
    "/app/licenses",
    "/app/ai-costs",
    "/app/findings",
  ]) {
    await page.goto(`${path}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${path} has horizontal overflow`).toBeLessThanOrEqual(1);
  }
});

test("finding details expose friendly data and link to the affected user", async ({
  page,
}) => {
  await openDemo(page);
  await page.goto("/app/findings");
  await page
    .getByRole("link", { name: /user profile/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/users\//);
  await expect(
    page.getByRole("heading", { level: 2, name: "Findings for this user" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /Disabled|activity|licensed|Copilot/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/findings\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: "Finding details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workflow preview" }),
  ).toBeVisible();
});

test("free workspaces expose exports and retire billing routes", async ({
  page,
}) => {
  await openDemo(page);
  await expect(
    page.getByRole("link", { name: "Billing", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Upgrade/ })).toHaveCount(0);
  for (const path of [
    "findings",
    "licenses",
    "pricebook",
    "report",
    "remediation",
    "audit",
  ]) {
    const response = await page.request.get(`/api/export/${path}`);
    expect(response.status(), path).toBe(200);
  }
  await page.goto("/app/billing");
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/msp");
  await expect(page).toHaveURL(/\/app\/portfolio$/);
  for (const path of [
    "checkout",
    "portal",
    "msp/checkout",
    "msp/portal",
    "webhook",
  ]) {
    const response = await page.request.post(`/api/billing/${path}`, {
      data: {},
    });
    expect(response.status(), path).toBe(404);
  }
  const reminders = await page.request.get("/api/cron/trial-reminders");
  expect(reminders.status()).toBe(404);
});
