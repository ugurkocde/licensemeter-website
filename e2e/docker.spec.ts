import { expect, test } from "./fixtures";

test.skip(
  !process.env.DOCKER_SMOKE,
  "Runs against the built Docker stack only",
);

test("self-hosted image uses runtime configuration and opens the sample tenant", async ({
  page,
  request,
}) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main", exact: true });
  await expect(
    nav.getByRole("link", { name: "GitHub", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://github.com/ugurkocde/licensemeter-website",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3100"}`,
  );
  expect(
    await page.locator('script[src*="crisp.chat"], script#crisp-chat').count(),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Open the sample tenant" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.goto("/app/ai-costs");
  await expect(
    page.getByRole("complementary", { name: "Sample data notice" }),
  ).toBeVisible();
  await page.goto("/app/connectors/openai");
  await expect(page.getByText(/No live connection/)).toBeVisible();
  expect((await request.get("/api/cron/sync")).status()).toBe(401);
  await page.goto("/support");
  await expect(
    page.getByText(/Support is managed by the administrator/),
  ).toBeVisible();
  const support = await request.post("/api/support", {
    headers: {
      Origin: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3100"}`,
    },
    data: {},
  });
  expect(support.status()).toBe(503);
  expect(await (await request.get("/robots.txt")).text()).toContain(
    "Disallow: /",
  );
  // PDF rendering depends on pdfkit's assets being traced into the built
  // image. When they were missing, every PDF download answered 500 while the
  // unit suite stayed green; this asserts the built output actually renders.
  const publicDpa = await request.get("/api/export/dpa");
  expect(publicDpa.ok()).toBe(true);
  expect(publicDpa.headers()["content-type"]).toContain("application/pdf");
  expect((await publicDpa.body()).subarray(0, 4).toString()).toBe("%PDF");
  const report = await page.request.get("/api/export/report");
  expect(report.ok()).toBe(true);
  expect(report.headers()["content-type"]).toContain("application/pdf");
  const findings = await page.request.get("/api/export/findings");
  expect(findings.ok()).toBe(true);
  expect(findings.headers()["content-type"]).toContain("text/csv");
  const image = await request.get(
    "/_next/image?url=%2Fbrand-mark.png&w=64&q=75",
  );
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toContain("image/");
});
