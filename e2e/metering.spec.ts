import { expect, test } from "./fixtures";

test("metering demo explains evidence, switches apps and fits mobile", async ({
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
  for (const text of [
    "Launch observed",
    "No launch observed",
    "Building coverage",
    "Report stale",
    "Coverage unknown",
  ]) {
    await expect(content.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(
    content.getByRole("button", { name: "Grant metering permissions" }),
  ).toHaveCount(0);
  await expect(
    content.getByRole("link", { name: "Export application CSV" }),
  ).toHaveCount(0);
  await content
    .getByRole("combobox", { name: "Application" })
    .selectOption("photoshop");
  await content.getByRole("button", { name: "Show application" }).click();
  await expect(page).toHaveURL(/app=photoshop/);
  await expect(
    content.getByText("Photoshop.exe", { exact: true }),
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
