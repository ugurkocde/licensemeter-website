import { test as base } from "@playwright/test";

/*
 * The product updates bell fetches the public changelog feed on every page.
 * Browser suites must not depend on that service, so the feed is answered
 * locally with an empty list. changelog.spec.ts installs its own routes.
 */
const FEED_URL = "https://changelog.ugurlabs.com/api/changelog/licensemeter**";

export const test = base.extend({
  page: async ({ page }, run) => {
    await page.route(FEED_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          product: {
            id: "licensemeter",
            name: "LicenseMeter",
            websiteUrl: "https://www.licensemeter.com/",
          },
          entries: [],
        }),
      }),
    );
    await run(page);
  },
});

export { expect } from "@playwright/test";
