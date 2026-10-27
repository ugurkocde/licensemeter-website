import { expect, test } from "./fixtures";

test("metering demo shows installed vs started, searches apps and fits mobile", async ({
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
    content.getByRole("heading", { name: "Software Metering", exact: true }),
  ).toBeVisible();
  await expect(
    content.getByText("Sample metering report.", { exact: true }),
  ).toBeVisible();
  const legend = content.getByRole("list", { name: "Legend" });
  for (const text of [
    "App started",
    "App not started",
    "Still collecting",
    "No data",
  ]) {
    await expect(legend.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(
    content.getByRole("heading", { name: "Installed vs started" }),
  ).toBeVisible();
  await expect(
    content.getByRole("heading", { name: "Collection health" }),
  ).toBeVisible();
  await expect(
    content.getByRole("button", { name: "Grant metering permissions" }),
  ).toHaveCount(0);
  await expect(content.getByRole("link", { name: "Export CSV" })).toHaveCount(
    0,
  );

  await content
    .getByRole("searchbox", {
      name: "Search apps, publishers or program files",
    })
    .fill("autocad");
  await content.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=autocad/);
  const apps = content.locator("#apps table");
  await expect(apps.getByRole("rowheader")).toHaveCount(1);
  await apps.getByRole("link", { name: "AutoCAD 2026" }).click();
  await expect(page).toHaveURL(/app=/);
  await expect(
    content.getByRole("heading", { name: "Devices · AutoCAD 2026" }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("metering-desktop.png"),
    fullPage: true,
  });
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
