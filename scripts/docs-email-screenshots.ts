/**
 * Renders the emails shown in docs/gitbook/workspace/emails.md from the real
 * templates with fictional data, and writes them as WebP documentation assets.
 * Nothing is sent and no database or mail service is touched.
 *
 *   SKIP_ENV_VALIDATION=1 npx tsx scripts/docs-email-screenshots.ts
 *
 * Needs a Playwright Chromium (`npx playwright install chromium`). Inspect the
 * images before publishing, and rerun after changing a template or its copy.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";
import sharp from "sharp";

const repo = process.cwd();
// The templates load the brand mark from `${baseUrl}/brand-mark.png`, so the
// public directory stands in for the site origin and no network is needed.
const baseUrl = pathToFileURL(path.join(repo, "public")).href.replace(
  /\/$/,
  "",
);
process.env.APP_BASE_URL = baseUrl;

const { digestHtml, inviteHtml } = await import("~/server/email");
const { leakAlertMessage } = await import("~/server/leakAlertMessage");
const { onboardingHtml } = await import("~/server/onboardingEmail");

const tenant = { name: "Contoso GmbH", tid: null, currency: "EUR" };

const emails: Record<string, string> = {
  "email-welcome": onboardingHtml({
    email: "anna.schmidt@contoso.example",
    name: "Anna Schmidt",
    baseUrl,
  }),
  "email-weekly-digest": digestHtml({
    tenantName: tenant.name,
    currency: tenant.currency,
    monthlySpend: "48.210 €",
    monthlyWaste: "6.940 €",
    openFindings: 37,
    topFindings: [
      {
        title: "12 disabled accounts still hold Microsoft 365 E3",
        impact: "412 €",
      },
      { title: "8 Copilot seats unused for 60 days", impact: "224 €" },
      { title: "5 Visio Plan 2 licenses never activated", impact: "70 €" },
    ],
    appUrl: baseUrl,
    delta: {
      newCount: 4,
      newImpact: "310 €",
      resolvedCount: 2,
      resolvedImpact: "96 €",
    },
    renewalLine: "Renewal in 42 days: Microsoft 365 E3, 480 seats.",
    aiSpendLine: "AI API spend this month: $1,280 across OpenAI and Anthropic.",
    footer: {
      workspaceName: tenant.name,
      emailLabel: "weekly digest",
      unsubscribeUrl: `${baseUrl}/api/unsubscribe`,
      settingsUrl: `${baseUrl}/sign-in`,
    },
  }),
  "email-leak-alert": leakAlertMessage(tenant, [
    {
      title: "anna.lindqvist@contoso.example: Microsoft 365 E5",
      monthlyImpactCents: 5470,
    },
    {
      title: "jan.meier@contoso.example: Microsoft 365 E3",
      monthlyImpactCents: 3370,
    },
    {
      title: "former.contractor@contoso.example: Power BI Pro",
      monthlyImpactCents: 940,
    },
    {
      title: "svc-scanner@contoso.example: Microsoft 365 F1",
      monthlyImpactCents: 0,
    },
  ]).html,
  "email-invitation": inviteHtml({
    inviterName: "Anna Schmidt",
    tenantName: tenant.name,
    role: "admin",
    appUrl: baseUrl,
  }),
};

const assets = path.join(repo, "docs/gitbook/.gitbook/assets");
const raw = fs.mkdtempSync(path.join(os.tmpdir(), "licensemeter-email-docs-"));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 760, height: 900 },
    deviceScaleFactor: 2,
  });
  for (const [name, html] of Object.entries(emails)) {
    const file = path.join(raw, `${name}.html`);
    fs.writeFileSync(file, html);
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => document.fonts.ready);
    // The outer table is the whole mail: wordmark, card and footer.
    const png = await page.locator("body > table").screenshot();
    await sharp(png)
      .webp({ quality: 85 })
      .toFile(path.join(assets, `${name}.webp`));
  }
  console.log(
    `Rendered ${Object.keys(emails).length} sample emails. Visually inspect them before publishing.`,
  );
} finally {
  await browser.close();
  fs.rmSync(raw, { recursive: true, force: true });
}
