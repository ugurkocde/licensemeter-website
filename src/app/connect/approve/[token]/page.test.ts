import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { CONNECTOR_SCOPES } from "~/lib/scopes";

const loadPendingHandoff = vi.fn();
vi.mock("~/server/consentState", () => ({ loadPendingHandoff }));
vi.mock("~/server/auth/consentHandoff", () => ({
  handoffFailurePath: (code: string) => `/connect/approve/error?error=${code}`,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(to);
  },
}));

const { default: ApprovePage } = await import("./page");
const { metadata } = await import("../layout");
const token = "handoff.aaaa1111-1111-4111-8111-111111111111";
const props = { params: Promise.resolve({ token }) };

it("renders the requester, workspace, and all connector permissions for a valid link", async () => {
  loadPendingHandoff.mockResolvedValue({
    state: { name: "Alex Rivera", email: "alex@example.com" },
    workspace: { name: "Contoso Test", tid: null },
  });
  const html = renderToStaticMarkup(await ApprovePage(props));
  expect(html).toContain("Alex Rivera");
  expect(html).toContain("Contoso Test");
  expect(html).toContain("Review and grant in Microsoft");
  expect(html).toContain(`/api/connect/approve?token=${token}`);
  expect(html).not.toContain("alex@example.com");
  for (const { scope } of CONNECTOR_SCOPES) expect(html).toContain(scope);
  expect(metadata.robots).toEqual({ index: false, follow: false });
  expect(metadata.referrer).toBe("no-referrer");
});

it("redirects ineligible links to the public error page", async () => {
  loadPendingHandoff.mockResolvedValue(undefined);
  await expect(ApprovePage(props)).rejects.toThrow(
    "/connect/approve/error?error=invalid_state",
  );
});
