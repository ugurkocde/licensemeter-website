import { expect, test } from "./fixtures";

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

test("hero logos follow the pointer, settle on exit, and respect reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const logo = page.locator(".orbit-logo-1");
  const transform = () =>
    logo.evaluate((element) => getComputedStyle(element).transform);
  const resting = await transform();
  const hero = await page.locator(".orbit-hero").boundingBox();
  expect(hero).not.toBeNull();
  await page.mouse.move(hero!.x + hero!.width * 0.85, hero!.y + 150);
  await expect.poll(transform).not.toBe(resting);
  await page.mouse.move(1, 1);
  await expect.poll(transform).toBe(resting);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(hero!.x + hero!.width * 0.85, hero!.y + 150);
  await expect.poll(transform).toBe("none");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("home page fits a mobile viewport and menu closes with Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const menuButton = page.getByRole("button", { name: "Open menu" });
  await menuButton.click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");

  await page.setViewportSize({ width: 320, height: 568 });
  const narrowLayout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    headerHeight: document.querySelector("header")?.getBoundingClientRect()
      .height,
  }));
  expect(narrowLayout.overflow).toBeLessThanOrEqual(1);
  expect(narrowLayout.headerHeight).toBeLessThanOrEqual(90);
});

test("home metadata and conversion labels describe the product consistently", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(
    "Microsoft 365 License Optimization Software | LicenseMeter",
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "licenses nobody uses",
  );
  await expect(
    page.getByRole("link", { name: "Run my free scan" }),
  ).toHaveCount(2);

  const openGraphUrl = await page
    .locator('meta[property="og:url"]')
    .getAttribute("content");
  expect(openGraphUrl).toMatch(/^https?:\/\//);
});

test("pricing page renders the three plans and is linked from the header", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main", exact: true })
    .getByRole("link", { name: "Pricing", exact: true })
    .click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page).toHaveTitle(/Pricing/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Finding the waste costs",
  );
  for (const plan of ["Free", "Pro", "MSP"]) {
    await expect(
      page.getByRole("heading", { level: 2, name: plan, exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator('[data-plan="pro"]')).toContainText("€99");
  await expect(page.locator('[data-plan="msp"]')).toContainText("€299");
  await expect(page.locator('[data-plan="free"]')).toContainText("No support");

  /* Unbuilt features sit in their own group and never carry a checkmark. */
  const soon = page.locator('[data-group="soon"]');
  await expect(soon).toContainText("Coming soon");
  await expect(soon).toContainText("Portfolio alerts");
  await expect(soon.getByText("Included", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Team roles and delegation")).toHaveCount(0);

  await expect(
    page.locator('link[rel="alternate"][hreflang="de"]'),
  ).toHaveAttribute("href", /\/de\/pricing$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/pricing$/,
  );
  await expect(
    page.locator("main").getByRole("link", { name: "status page" }),
  ).toHaveAttribute("href", "/status");
  await expect(
    page
      .locator("main")
      .getByRole("link", { name: "data processing agreement" }),
  ).toHaveAttribute("href", "/dpa");

  for (const path of ["/sitemap.xml", "/llms.txt"]) {
    const response = await page.request.get(path);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain("/pricing");
  }
});

test("the MSP page carries no pricing", async ({ page }) => {
  await page.goto("/msp");
  const main = page.locator("main");
  await expect(main.locator('a[href*="pricing"]')).toHaveCount(0);
  await expect(main).not.toContainText("€99");
  await expect(main).not.toContainText("€299");
});

test("German pricing page is localized", async ({ page }) => {
  await page.goto("/de/pricing");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page).toHaveTitle(/Preise/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Verschwendung zu finden kostet",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("link", { name: "Preise", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-plan="pro"]')).toContainText("99\u00a0€");
  await expect(page.locator('[data-plan="pro"]')).toContainText(
    "Auftragsverarbeitungsvertrag",
  );
  await expect(page.locator('[data-plan="msp"]')).toContainText(
    "AVV, der Ihre Kunden-Tenants abdeckt",
  );
  await expect(page.locator('[data-group="soon"]')).toContainText(
    "In Vorbereitung",
  );
  await expect(
    page.locator("main").getByRole("link", { name: "English", exact: true }),
  ).toHaveAttribute("href", "/pricing");
});

test("yearly billing toggle switches the price without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/pricing");
  const pro = page.locator('[data-plan="pro"]');
  await expect(pro.locator('[data-price="month"]')).toBeVisible();
  await expect(pro.locator('[data-price="year"]')).toBeHidden();
  /* The label also holds the saving badge, so address it by its input. */
  await page.locator('label[for="bill-y"]').click();
  await expect(pro.locator('[data-price="year"]')).toBeVisible();
  await expect(pro.locator('[data-price="year"]')).toContainText("€990");
  await expect(pro.locator('[data-price="month"]')).toBeHidden();
  await expect(
    page.locator('[data-plan="msp"] [data-price="year"]'),
  ).toContainText("€2,990");
  await page.locator('label[for="bill-m"]').click();
  await expect(pro.locator('[data-price="month"]')).toBeVisible();
  await context.close();
});

test("pricing pages fit a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  for (const path of ["/pricing", "/de/pricing"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("feature tabs support arrow keys and the modal restores focus", async ({
  page,
}) => {
  const initialMediaRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/videos/")) {
      initialMediaRequests.push(request.url());
    }
  });
  await page.goto("/");
  await page.waitForTimeout(500);
  expect(initialMediaRequests).toEqual([]);

  const tabs = page.getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

  const activeVideo = page.locator("#feature-panel video");
  await expect(activeVideo).toHaveCount(1);
  await expect(activeVideo).toHaveAttribute(
    "poster",
    "/videos/feature-findings.webp",
  );
  await expect(activeVideo).not.toHaveAttribute("autoplay", "");

  const trigger = page.getByRole("button", {
    name: /Product demo: Act on findings in bulk, enlarge/,
  });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close video" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("product tour honors reduced motion before media playback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("#product-tour").scrollIntoViewIfNeeded();

  const video = page.locator("#feature-panel video");
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute("controls", "");
  await expect(
    page.getByRole("button", { name: "Pause rotation" }),
  ).toHaveCount(0);
  const paused = await video.evaluate(
    (element) => (element as HTMLVideoElement).paused,
  );
  expect(paused).toBe(true);
});

test("ROI calculator responds to user assumptions", async ({ page }) => {
  await page.goto("/roi");

  const output = page.getByText(/estimated monthly waste/);
  const before = await output.textContent();
  await page.getByLabel("Paid seats").fill("500");
  await expect(output).not.toHaveText(before ?? "");
  await expect(
    page.getByText(/LicenseMeter is free at every seat count/),
  ).toBeVisible();
});

test("German trust pages localize the shell and document language", async ({
  page,
}) => {
  await page.goto("/de/security");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(
    page.getByRole("navigation", { name: "Hauptnavigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Kostenlos starten" }),
  ).toBeVisible();
  await expect(
    page.getByText("In der EU gehostet", { exact: true }),
  ).toBeVisible();
});

test("connector index ends with a clear next step", async ({ page }) => {
  await page.goto("/connectors");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Connect what",
  );
  await expect(
    page.getByRole("link", { name: "Start Free", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review Security" }),
  ).toBeVisible();
});

test("light mode persists under a dark system preference across public and dashboard pages", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  for (const path of ["/", "/support", "/privacy"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light only");
    await expect(page.locator(".marketing-frame")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open the sample tenant" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator("aside").first()).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light only");
  await expect(
    page
      .getByRole("navigation", { name: "Workspace navigation", exact: true })
      .getByRole("link", { name: "Support", exact: true }),
  ).toBeVisible();
});

test("Crisp loads once across navigation and remains separate from the support form", async ({
  page,
}) => {
  let loads = 0;
  await page.route("https://client.crisp.chat/l.js", async (route) => {
    loads++;
    await route.fulfill({
      contentType: "application/javascript",
      body: "/* Mock the remote chat service. */",
    });
  });
  await page.goto("/");
  await expect(page.locator("#crisp-sdk")).toHaveCount(1);
  await expect.poll(() => loads).toBe(1);
  await page
    .getByRole("navigation", { name: "Main", exact: true })
    .getByRole("link", { name: "Support", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Contact support", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open support chat", exact: true }),
  ).toHaveCount(0);
  const config = await page.evaluate(() => ({
    id: window.CRISP_WEBSITE_ID,
    queue: window.$crisp,
  }));
  expect(config.id).toBe("d8cf4fcb-0dbe-42ee-b94c-3bbc415d58f4");
  expect(config.queue).toContainEqual(["config", "color:mode", ["light"]]);
  expect(loads).toBe(1);
  await page.setViewportSize({ width: 320, height: 568 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test("support form handles delivery failure and successful retry", async ({
  page,
}) => {
  await page.goto("/support");
  await page.getByLabel("Name", { exact: true }).fill("Test Visitor");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("visitor@example.com");
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Connector setup question");
  await page
    .getByLabel("Message", { exact: true })
    .fill("How do I connect the sample workspace?");
  let submissions = 0;
  await page.route("**/api/support", async (route) => {
    submissions++;
    expect(route.request().postDataJSON()).toMatchObject({
      name: "Test Visitor",
      email: "visitor@example.com",
      token: "",
      website: "",
    });
    await route.fulfill({
      status: submissions === 1 ? 502 : 200,
      json:
        submissions === 1 ? { error: "Please try again." } : { success: true },
    });
  });
  await page
    .getByRole("button", { name: "Send support request", exact: true })
    .click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Please try again.",
  );
  await page
    .getByRole("button", { name: "Send support request", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Support request sent");
  expect(submissions).toBe(2);
});

test("sign-in page explains the steps and starts the Microsoft flow", async ({
  page,
}) => {
  await page.goto("/sign-in?returnTo=%2Fapp%2Fconnect%2Fcsv");

  await expect(page).toHaveTitle("Sign in | LicenseMeter");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Sign in to LicenseMeter",
  );

  const card = page.locator("#sign-in");
  const button = card.getByRole("link", {
    name: "Sign in with Microsoft",
    exact: true,
  });
  await expect(button).toHaveAttribute(
    "href",
    "/api/auth/signin?returnTo=%2Fapp%2Fconnect%2Fcsv",
  );
  const box = await button.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await expect(card.getByRole("link", { name: "Terms" })).toHaveAttribute(
    "href",
    "/terms",
  );
  await expect(
    card.getByRole("link", { name: "data processing agreement" }),
  ).toHaveAttribute("href", "/dpa");
  await expect(
    card.getByRole("link", { name: "privacy policy" }),
  ).toHaveAttribute("href", "/privacy");
  await expect(
    card.getByRole("link", { name: "Read the docs" }),
  ).toHaveAttribute("href", "https://docs.licensemeter.com/");

  await expect(page.getByRole("heading", { level: 3 })).toHaveText([
    "Step 1: Sign in with Microsoft",
    "Step 2: Your workspace is ready",
    "Step 3: Connect Microsoft 365",
    "Step 4: See what the unused licenses cost",
  ]);
  await expect(page.getByText("User.Read.All", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "security overview" }),
  ).toHaveAttribute("href", "/security");
});

test("sign-in page drops a foreign returnTo and never echoes an error code", async ({
  page,
}) => {
  await page.goto(
    "/sign-in?returnTo=https%3A%2F%2Fevil.example%2Fapp&error=%3Cb%3Ex%3C%2Fb%3E",
  );
  await expect(
    page
      .locator("#sign-in")
      .getByRole("link", { name: "Sign in with Microsoft", exact: true }),
  ).toHaveAttribute("href", "/api/auth/signin");
  await expect(page.locator("#sign-in").getByRole("alert")).toContainText(
    "Microsoft could not complete the sign-in",
  );
  await expect(page.locator("body")).not.toContainText("<b>x</b>");
});

test("sign-in page leads with the button and fits a 320px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/sign-in");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const button = await page
    .getByRole("link", { name: "Sign in with Microsoft", exact: true })
    .boundingBox();
  const steps = await page
    .getByRole("heading", { level: 2, name: /Four steps/ })
    .boundingBox();
  expect(button).not.toBeNull();
  expect(steps).not.toBeNull();
  expect(button!.y).toBeLessThan(steps!.y);
});
