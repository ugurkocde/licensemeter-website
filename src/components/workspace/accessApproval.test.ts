import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/app",
}));

import { JoinRequestNotice } from "./JoinRequestNotice";
import { OnboardingEmptyState } from "./OnboardingEmptyState";
import { NavLinks } from "./NavLinks";

describe("approval guidance", () => {
  it("replaces connector onboarding with the waiting instructions", () => {
    const waiting = renderToStaticMarkup(
      createElement(OnboardingEmptyState, {
        organizationHint: { requestPending: true },
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
        workspaceName: "Acme",
        status: "declined",
        contacts: [],
      }),
    );
    expect(html).toContain("Access request declined");
    expect(html).toContain("ask for an invitation");
    expect(html).not.toContain("Check approval status");
  });

  it("labels the approver's settings badge and omits it at zero", () => {
    expect(
      renderToStaticMarkup(
        createElement(NavLinks, { pendingAccessRequests: 2 }),
      ),
    ).toContain('aria-label="2 pending access requests"');
    expect(renderToStaticMarkup(createElement(NavLinks))).not.toContain(
      "pending access requests",
    );
  });
});
