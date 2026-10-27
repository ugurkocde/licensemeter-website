import { expect, test } from "./fixtures";

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
  for (const name of ["Dashboard", "Apps", "Setup"])
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveAttribute("aria-current", "page");

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

  await nav.getByRole("link", { name: "Setup", exact: true }).click();
  await expect(
    content.getByText("The sample workspace is already set up."),
  ).toBeVisible();

  await page.goto("/app/metering");
  await page.setViewportSize({ width: 375, height: 812 });
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
