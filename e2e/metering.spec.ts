import { expect, test } from "./fixtures";

test("sample report walks through the sample metering report", async ({
  page,
}) => {
  await page.goto("/sample-report");
  await expect(
    page.getByRole("heading", { name: "What Software Metering adds" }),
  ).toBeVisible();
  // Figures come from DEMO_FIGURES.metering, recomputed from the sample
  // metering generator in demoFigures.test.ts.
  await expect(page.getByText(/42 fictional devices/)).toBeVisible();
  const visio = page.getByRole("row", { name: /Microsoft Visio/ });
  await expect(visio).toContainText("14");
  await expect(visio).toContainText("6");
  await expect(visio).toContainText("7");
  await expect(page.getByText(/Contoso Time Tracker/)).toBeVisible();
});

test("metering demo: sidebar sections, overview charts, app search and mobile fit", async ({
  page,
}) => {
  await page.route("https://client.crisp.chat/l.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open the sample tenant" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/metering");
  const content = page.locator("#content");
  await expect(
    content.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    content.getByText("Sample metering report.", { exact: true }),
  ).toBeVisible();

  // The section's pages appear under its sidebar item while it is open.
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  for (const name of ["Dashboard", "Apps", "Devices", "Setup"])
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  // The product tour points its Software Metering step at this anchor.
  await expect(nav.locator('a[href="/app/metering"]').first()).toHaveAttribute(
    "data-tour",
    "nav-metering",
  );

  // The fleet chart leads; its apps open their own page.
  await expect(
    content.getByRole("heading", { name: "App starts, last 30 days" }),
  ).toBeVisible();
  await expect(
    content
      .getByRole("list", { name: "Apps in the chart" })
      .getByRole("link")
      .first(),
  ).toBeVisible();
  const legend = content.getByRole("list", { name: "Legend" });
  for (const text of [
    "App started",
    "App not started",
    "Still collecting",
    "No data",
  ])
    await expect(legend.getByText(text, { exact: true })).toBeVisible();
  await expect(
    content.getByRole("heading", { name: "Installed vs started" }),
  ).toBeVisible();
  await expect(
    content.getByRole("heading", { name: "Collection health" }),
  ).toBeVisible();
  await expect(
    content.getByRole("heading", { name: "Recent app starts" }),
  ).toBeVisible();
  await expect(content.getByRole("link", { name: "Export CSV" })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: test.info().outputPath("metering-overview.png"),
    fullPage: true,
  });

  await nav.getByRole("link", { name: "Apps", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/metering\/apps$/);
  await content.getByRole("searchbox", { name: "Search apps" }).fill("autocad");
  const apps = content.getByRole("region", { name: "Apps" }).getByRole("link");
  await expect(apps).toHaveCount(1);
  await apps.click();
  await expect(page).toHaveURL(/app=/);
  await expect(
    content.getByRole("heading", { name: "AutoCAD 2026", level: 2 }),
  ).toBeVisible();
  await expect(
    content.getByRole("button", { name: "Left out", exact: false }),
  ).toBeVisible();
  await expect(
    content.getByRole("heading", { name: "Starts per day", level: 3 }),
  ).toBeVisible();

  // A device opens from the app's device list and shows its own apps.
  await content
    .getByRole("table", { name: "AutoCAD 2026 by device" })
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/metering\/devices\?device=/);
  await expect(
    content.getByRole("heading", { name: "App starts per day", level: 3 }),
  ).toBeVisible();
  // The device explains its health state and links to the matching docs.
  await expect(
    content.getByRole("link", { name: "About this state" }),
  ).toHaveAttribute("href", /windows-metering\/#/);
  await expect(
    content
      .getByRole("table", { name: /^Metered apps on / })
      .getByRole("link", {
        name: "AutoCAD 2026",
      }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("metering-device.png"),
    fullPage: true,
  });
  await content.getByRole("searchbox", { name: "Search devices" }).fill("fin");
  await expect(
    content.getByRole("region", { name: "Devices" }).getByRole("link").first(),
  ).toContainText("FIN");

  await nav.getByRole("link", { name: "Setup", exact: true }).click();
  await expect(
    content.getByText("The sample workspace is already set up."),
  ).toBeVisible();

  await page.goto("/app/metering");
  await page.setViewportSize({ width: 375, height: 812 });
  // Measure the rendered dashboard, not its loading skeleton.
  await expect(
    content.getByRole("heading", { name: "App starts, last 30 days" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: test.info().outputPath("metering-mobile.png"),
    fullPage: true,
  });
});
