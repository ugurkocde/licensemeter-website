import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/accessRequestActions", () => ({
  checkAccessRequest: vi.fn(),
  acknowledgeDeclinedRequest: vi.fn(),
}));

const navigation = vi.hoisted(() => ({ path: "/app" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => navigation.path,
}));

import { JoinRequestNotice } from "./JoinRequestNotice";
import { OnboardingEmptyState } from "./OnboardingEmptyState";
import { NavLinks } from "./NavLinks";
import { AccessRequestStrip } from "./AccessRequestStrip";

describe("approval guidance", () => {
  it("replaces connector onboarding with the waiting instructions", () => {
    const waiting = renderToStaticMarkup(
      createElement(OnboardingEmptyState, {
        organizationHint: { requestStatus: "pending" },
      }),
    );
    expect(waiting).toContain("You do not need to connect Microsoft 365");
    expect(waiting).not.toContain('href="/app/connectors/microsoft"');
    expect(waiting).not.toContain("Add your Microsoft 365 directory");
    const fresh = renderToStaticMarkup(createElement(OnboardingEmptyState));
    expect(fresh).toContain("Add your Microsoft 365 directory");
  });

  it("keeps approval contacts and next steps visible with safe tenant text", () => {
    const html = renderToStaticMarkup(
      createElement(JoinRequestNotice, {
        requestId: "aaaaaaaa-0000-4000-8000-000000000001",
        requestedAt: "2026-09-28T10:00:00Z",
        workspaceName: "<script>Acme</script>",
        status: "pending",
        contacts: [
          { name: "Olivia Owner", email: "owner@acme.example", role: "owner" },
        ],
      }),
    );
    expect(html).toContain("owner@acme.example");
    expect(html).toContain("Check approval status");
    expect(html).not.toContain("Dismiss");
    expect(html).not.toContain("<script>");
  });

  it("explains a decline even when email is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(JoinRequestNotice, {
        requestId: "aaaaaaaa-0000-4000-8000-000000000001",
        requestedAt: "2026-09-28T10:00:00Z",
        workspaceName: "Acme",
        status: "declined",
        contacts: [],
      }),
    );
    expect(html).toContain("was declined");
    expect(html).toContain("for an invitation");
    expect(html).not.toContain("Check approval status");
    expect(html).toContain("Acknowledge decision");
  });

  it("labels the approver's settings badge and omits it at zero", () => {
    expect(
      renderToStaticMarkup(
        createElement(NavLinks, { pendingAccessRequests: 2 }),
      ),
    ).toContain("2 pending access requests");
    expect(renderToStaticMarkup(createElement(NavLinks))).not.toContain(
      "pending access requests",
    );
  });
});

it("keeps declined colleagues out of connector onboarding", () => {
  const html = renderToStaticMarkup(
    createElement(OnboardingEmptyState, {
      organizationHint: { requestStatus: "declined" },
    }),
  );
  expect(html).not.toContain('href="/app/connectors/microsoft"');
  expect(html).not.toContain("Add your Microsoft 365 directory");
  expect(html).toContain("request was declined");
});

it("never renders contacts in a decided card, even with stale props", () => {
  for (const status of ["declined", "approved"] as const) {
    const html = renderToStaticMarkup(
      createElement(JoinRequestNotice, {
        requestId: "aaaaaaaa-0000-4000-8000-000000000001",
        requestedAt: "2026-09-28T10:00:00Z",
        workspaceName: "Acme",
        status,
        contacts: [
          { email: "private@acme.example", name: "Owner", role: "owner" },
        ],
      }),
    );
    expect(html).not.toContain("private@acme.example");
  }
});

it("keeps declines reachable on a populated Overview without a global notice", () => {
  const props = {
    requests: [{ id: "request", workspaceName: "Acme", status: "declined" }],
    fullCardOnOverview: false,
  };
  navigation.path = "/app";
  const overview = renderToStaticMarkup(
    createElement(AccessRequestStrip, props),
  );
  expect(overview).toContain('href="/app/access-requests"');
  expect(overview).toContain("declined");
  expect(overview).not.toContain("awaiting approval");
  navigation.path = "/app/settings";
  expect(renderToStaticMarkup(createElement(AccessRequestStrip, props))).toBe(
    "",
  );
  navigation.path = "/app";
  expect(
    renderToStaticMarkup(
      createElement(AccessRequestStrip, { ...props, fullCardOnOverview: true }),
    ),
  ).toBe("");
});
