import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({ env: {} }));

const {
  allClearHtml,
  digestHtml,
  domainJoinedHtml,
  inviteHtml,
  joinApprovedHtml,
  joinRequestHtml,
  leakAlertHtml,
  membershipClaimHtml,
  reportHtml,
  workspaceDeletedHtml,
} = await import("~/server/email");

const { welcomeHtml } = await import("~/server/welcomeEmail");
const { onboardingHtml } = await import("~/server/onboardingEmail");

const appUrl = "https://licensemeter.com";
const HOSTILE = '<img src=x onerror="alert(1)">';
const footer = {
  workspaceName: HOSTILE,
  emailLabel: "weekly digest",
  unsubscribeUrl: "https://licensemeter.com/api/unsubscribe?m=1&j=digest&t=abc",
  settingsUrl: "https://licensemeter.com/sign-in?returnTo=%2Fapp%2Fsettings",
};

/** Every template, fed hostile text wherever a caller passes tenant data. */
const TEMPLATES: Record<string, string> = {
  invite: inviteHtml({
    inviterName: HOSTILE,
    tenantName: HOSTILE,
    role: HOSTILE,
    appUrl,
  }),
  joinRequest: joinRequestHtml({
    requesterEmail: HOSTILE,
    tenantName: HOSTILE,
    appUrl,
  }),
  domainJoined: domainJoinedHtml({
    memberEmail: HOSTILE,
    tenantName: HOSTILE,
    appUrl,
  }),
  joinApproved: joinApprovedHtml({ tenantName: HOSTILE, appUrl }),
  membershipClaim: membershipClaimHtml({
    claimUrl: 'https://licensemeter.com/auth/claim?token=a"b&x=1',
    appUrl,
    minutes: 30,
  }),
  digest: digestHtml({
    tenantName: HOSTILE,
    currency: "EUR",
    monthlySpend: HOSTILE,
    monthlyWaste: HOSTILE,
    openFindings: 3,
    topFindings: [{ title: HOSTILE, impact: HOSTILE }],
    appUrl,
    delta: {
      newCount: 2,
      newImpact: HOSTILE,
      resolvedCount: 1,
      resolvedImpact: HOSTILE,
    },
    renewalLine: HOSTILE,
    aiSpendLine: HOSTILE,
    footer,
  }),
  allClear: allClearHtml({
    tenantName: HOSTILE,
    resolvedCount: 2,
    resolvedImpact: HOSTILE,
    renewalLine: HOSTILE,
    aiSpendLine: HOSTILE,
    appUrl,
    footer,
  }),
  report: reportHtml({
    tenantName: HOSTILE,
    monthlySpend: HOSTILE,
    monthlyWaste: HOSTILE,
    openFindings: 1,
    appUrl,
    footer,
  }),
  leakAlert: leakAlertHtml({
    tenantName: HOSTILE,
    leakCount: 12,
    totalImpact: HOSTILE,
    items: [{ title: HOSTILE, impact: HOSTILE }],
    appUrl,
  }),
  workspaceDeleted: workspaceDeletedHtml({
    tenantName: HOSTILE,
    actor: HOSTILE,
    appUrl,
  }),
  welcome: welcomeHtml({
    email: `anna@${HOSTILE}.com`,
    baseUrl: appUrl,
    unsubscribeUrl: "https://licensemeter.com/api/unsubscribe?e=a&t=b",
  }),
  onboarding: onboardingHtml({
    email: HOSTILE,
    name: HOSTILE,
    baseUrl: appUrl,
  }),
};

describe.each(Object.entries(TEMPLATES))("%s email", (_name, html) => {
  it("escapes every piece of tenant text", () => {
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('onerror="alert');
  });

  it("is a complete document in the shared look", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('src="https://licensemeter.com/brand-mark.png"');
    expect(html).not.toMatch(/Georgia|#a8330d|#faf8f3/);
  });

  it("names the font in every cell, which Outlook does not inherit", () => {
    const cells = html.match(/<td[^>]*>/g) ?? [];
    // Spacer, image and pure wrapper cells carry no text of their own; every
    // other cell needs a family.
    const bare = cells.filter(
      (td) =>
        !td.includes("font-family") &&
        !td.includes("font-size:0") &&
        !td.includes("padding-right:10px;vertical-align:middle") &&
        !td.includes('class="pad brand"') &&
        !td.includes('class="outer"') &&
        !td.includes('class="card"'),
    );
    expect(bare).toEqual([]);
  });

  it("never links an app page directly, only through sign-in", () => {
    expect(html).not.toContain('href="https://licensemeter.com/app');
  });

  it("uses no em or en dashes and no arrows", () => {
    for (const code of [0x2013, 0x2014, 0x2192]) {
      expect(html).not.toContain(String.fromCharCode(code));
    }
  });
});

describe("app links", () => {
  it("send each mail to the page it is about", () => {
    const to = (path: string) =>
      `href="https://licensemeter.com/sign-in?returnTo=${encodeURIComponent(path)}"`;
    expect(TEMPLATES.invite).toContain(to("/app"));
    expect(TEMPLATES.joinRequest).toContain(to("/app/settings"));
    expect(TEMPLATES.domainJoined).toContain(to("/app/settings"));
    expect(TEMPLATES.joinApproved).toContain(to("/app"));
    expect(TEMPLATES.digest).toContain(to("/app/findings"));
    expect(TEMPLATES.allClear).toContain(to("/app/findings"));
    expect(TEMPLATES.report).toContain(to("/app"));
    expect(TEMPLATES.leakAlert).toContain(to("/app/findings"));
    expect(TEMPLATES.leakAlert).toContain(to("/app/settings"));
  });

  it("keep the one-time claim link intact and escaped", () => {
    expect(TEMPLATES.membershipClaim).toContain(
      'href="https://licensemeter.com/auth/claim?token=a&quot;b&amp;x=1"',
    );
  });
});

describe("scheduled email footer", () => {
  it("offers unsubscribe and settings", () => {
    expect(TEMPLATES.digest).toContain("Unsubscribe from the weekly digest");
    expect(TEMPLATES.digest).toContain("/api/unsubscribe?m=1&amp;j=digest");
    expect(TEMPLATES.digest).toContain("Manage email settings");
  });
});

describe("leak alert", () => {
  it("summarises the rows that did not fit", () => {
    expect(TEMPLATES.leakAlert).toContain("And 11 more in the app.");
  });
});

describe("workspace deleted notice", () => {
  it("has no call to action: the workspace is gone", () => {
    expect(TEMPLATES.workspaceDeleted).not.toContain("v:roundrect");
  });
});
