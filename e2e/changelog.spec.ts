import { expect, test, type Page, type Route } from "@playwright/test";

const FEED_URL = "https://changelog.ugurlabs.com/api/changelog/licensemeter**";

/* Synthetic feed only; the public feed is never exercised from the suite. */
const FEED = {
  product: {
    id: "licensemeter",
    name: "LicenseMeter",
    websiteUrl: "https://www.licensemeter.com/",
  },
  entries: [
    {
      id: "11111111-aaaa-4aaa-8aaa-111111111111",
      title: "Bulk actions for findings",
      summary: "Acknowledge or export many findings at once.",
      type: "new",
      publishedOn: "2026-09-12",
      sourceUrl: "https://www.licensemeter.com/connectors",
    },
    {
      id: "22222222-bbbb-4bbb-8bbb-222222222222",
      title: "Faster Microsoft 365 sync",
      summary: "Large tenants finish their first sync sooner.",
      type: "improved",
      publishedOn: "2026-09-01",
      sourceUrl: null,
    },
  ],
};

const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });

const mockFeed = async (page: Page, body: unknown = FEED) => {
  let requests = 0;
  await page.route(FEED_URL, (route) => {
    requests++;
    return fulfillJson(route, body);
  });
  return () => requests;
};

const bell = (page: Page) =>
  page.getByRole("button", { name: /^Product updates/ });

const focusedInsideDialog = (page: Page) =>
  page.evaluate(() => document.activeElement?.closest("dialog[open]") !== null);

test.beforeEach(async ({ page }) => {
  await page.route("https://client.crisp.chat/l.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "/* Isolated chat service for browser tests. */",
    }),
  );
});

test("desktop bell shows unread count, opens a right-side sheet, and marks updates read", async ({
  page,
}) => {
  const requests = await mockFeed(page);
  await page.goto("/");

  const trigger = bell(page);
  await expect(trigger).toHaveAccessibleName("Product updates, 2 unread");
  expect(requests()).toBe(1);

  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "What's new" });
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    dialog.getByRole("button", { name: "Close updates" }),
  ).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  // Full-height sheet docked to the right edge on desktop, not full screen.
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.width).toBe(400);
  expect(box!.x + box!.width).toBe(viewport.width - 12);
  expect(box!.y).toBe(12);
  expect(box!.height).toBe(viewport.height - 24);
  await expect(
    dialog.getByText("News and improvements from LicenseMeter."),
  ).toBeVisible();

  // Date, title, summary, and links; no change-type labels anywhere.
  await expect(dialog.getByText("12 Sept 2026")).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Bulk actions for findings" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Acknowledge or export many findings at once."),
  ).toBeVisible();
  const readLinks = dialog.getByRole("link", { name: "Read update" });
  await expect(readLinks).toHaveCount(2);
  await expect(readLinks.first()).toHaveAttribute(
    "href",
    "https://www.licensemeter.com/connectors",
  );
  await expect(readLinks.last()).toHaveAttribute(
    "href",
    "https://changelog.ugurlabs.com/?product=licensemeter#change-22222222-bbbb-4bbb-8bbb-222222222222",
  );
  await expect(
    dialog.getByRole("link", { name: "View all LicenseMeter updates" }),
  ).toHaveAttribute(
    "href",
    "https://changelog.ugurlabs.com/?product=licensemeter",
  );
  for (const label of ["new", "improved", "fixed", "maintenance"]) {
    await expect(dialog.getByText(label, { exact: true })).toHaveCount(0);
  }

  // Tab never leaves the modal.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await focusedInsideDialog(page)).toBe(true);
  }
  await page.keyboard.press("Shift+Tab");
  expect(await focusedInsideDialog(page)).toBe(true);

  // Escape closes, restores focus and scrolling, and the badge is cleared.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(trigger).toHaveAccessibleName("Product updates");

  // Read state persists across loads; still one request per page load.
  await page.reload();
  await expect(bell(page)).toHaveAccessibleName("Product updates");
  await page.waitForTimeout(2_000);
  expect(requests()).toBe(2);
});

test("mobile panel fills the screen, scrolls, and closes from the header", async ({
  page,
}) => {
  await mockFeed(page, {
    ...FEED,
    entries: Array.from({ length: 30 }, (_, i) => ({
      id: `entry-${i}`,
      title: `Update ${i + 1}`,
      summary: "Synthetic entry used to force scrolling in the panel.",
      type: "fixed",
      publishedOn: "2026-08-01",
      sourceUrl: null,
    })),
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const trigger = bell(page);
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAccessibleName("Product updates, 30 unread");
  const badge = trigger.locator("span[aria-hidden]");
  await expect(badge).toHaveText("9+");

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "What's new" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 375, height: 812 });
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  const list = dialog.locator("ol");
  await expect(list.getByRole("listitem")).toHaveCount(30);
  const scroller = dialog.locator(".overflow-y-auto");
  const scrollable = await scroller.evaluate(
    (el) => el.scrollHeight > el.clientHeight,
  );
  expect(scrollable).toBe(true);
  await expect(
    dialog.getByRole("link", { name: "View all LicenseMeter updates" }),
  ).toBeInViewport();

  await dialog.getByRole("button", { name: "Close updates" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAccessibleName("Product updates");

  // The header card itself must hold brand, burger, bell, and CTA at every
  // narrow width, not just avoid document-level overflow.
  for (const width of [320, 341, 360, 399]) {
    await page.setViewportSize({ width, height: 568 });
    const layout = await page.evaluate(() => {
      const header = document.querySelector("header")!;
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        headerOverflow: header.scrollWidth - header.clientWidth,
        headerHeight: header.getBoundingClientRect().height,
      };
    });
    expect(layout.overflow, `${width}px`).toBeLessThanOrEqual(1);
    expect(layout.headerOverflow, `${width}px`).toBe(0);
    expect(layout.headerHeight, `${width}px`).toBeLessThanOrEqual(90);
  }
});

test("panel reports failures, retries, and rejects another product's feed", async ({
  page,
}) => {
  let attempts = 0;
  await page.route(FEED_URL, (route) => {
    attempts++;
    if (attempts === 1) return fulfillJson(route, { error: "down" }, 503);
    if (attempts === 2) {
      return fulfillJson(route, {
        ...FEED,
        product: { ...FEED.product, id: "intuneget" },
      });
    }
    return fulfillJson(route, FEED);
  });
  await page.goto("/");
  const trigger = bell(page);
  await expect(trigger).toHaveAccessibleName("Product updates");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "What's new" });
  await expect(dialog.getByRole("alert")).toContainText(
    "Updates could not be loaded.",
  );
  await dialog.getByRole("button", { name: "Retry" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Updates could not be loaded.",
  );
  await dialog.getByRole("button", { name: "Retry" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Bulk actions for findings" }),
  ).toBeVisible();
  expect(attempts).toBe(3);
});

test("empty feed renders a friendly state and German pages localize the bell", async ({
  page,
}) => {
  await mockFeed(page, { ...FEED, entries: [] });
  await page.goto("/de/security");
  const trigger = page.getByRole("button", { name: "Produktneuigkeiten" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Neuigkeiten" });
  await expect(dialog.getByRole("status")).toContainText(
    "Noch keine Neuigkeiten",
  );
  await expect(
    dialog.getByRole("link", { name: "Alle Neuigkeiten von LicenseMeter" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("read state syncs across tabs", async ({ page, context }) => {
  await mockFeed(page);
  await page.goto("/");
  await expect(bell(page)).toHaveAccessibleName("Product updates, 2 unread");

  const other = await context.newPage();
  await mockFeed(other);
  await other.goto("/");
  await expect(bell(other)).toHaveAccessibleName("Product updates, 2 unread");

  await bell(other).click();
  await expect(other.getByRole("dialog")).toBeVisible();
  await expect(bell(page)).toHaveAccessibleName("Product updates");
  await other.close();
});

test("dashboard bells share one request and open from sidebar and mobile bar", async ({
  page,
}) => {
  const requests = await mockFeed(page);
  await page.goto("/");
  // The marketing header bell loads the feed once for the landing page; the
  // demo sign-in is a full navigation, so count only what the dashboard adds.
  await expect(bell(page)).toHaveAccessibleName("Product updates, 2 unread");
  const marketingRequests = requests();
  await page
    .getByRole("button", { name: "Open the sample tenant" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app$/);
  // The first demo visit of a database opens the tour over the page; its
  // dismissal is stored on the demo membership, so later runs never see it.
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  await skipTour
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => skipTour.click())
    .catch(() => undefined);

  const aside = page.locator("aside").first();
  const desktopBell = aside.getByRole("button", { name: /^Product updates/ });
  await expect(desktopBell).toHaveAccessibleName("Product updates, 2 unread");
  await page.waitForTimeout(500);
  expect(requests() - marketingRequests).toBe(1);

  await desktopBell.click();
  const dialog = page.getByRole("dialog", { name: "What's new" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x + box!.width).toBe(page.viewportSize()!.width - 12);
  expect(box!.width).toBe(400);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(desktopBell).toHaveAccessibleName("Product updates");

  await page.setViewportSize({ width: 375, height: 812 });
  const mobileBell = page
    .locator("header")
    .getByRole("button", { name: /^Product updates/ });
  await expect(mobileBell).toBeVisible();
  await expect(mobileBell).toHaveAccessibleName("Product updates");
  await mobileBell.click();
  await expect(page.getByRole("dialog", { name: "What's new" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mobileBell).toBeFocused();
  expect(requests() - marketingRequests).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
