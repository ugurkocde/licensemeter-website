import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { CONNECTOR_SCOPES } from "~/lib/scopes";
import type * as ConsentState from "~/server/consentState";

const loadPendingHandoff = vi.fn();
const loadConsentState = vi.fn();
const readHandoffCompletion = vi.fn();
const readHandoffProof = vi.fn();
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/consentState", async (original) => ({
  ...(await original<typeof ConsentState>()),
  loadPendingHandoff,
  loadConsentState,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("~/server/auth/consentHandoff", () => ({
  allowHandoffRequest: async () => true,
  readHandoffCompletion,
  readHandoffProof,
  handoffFailurePath: (code: string) => `/connect/approve/error?error=${code}`,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(to);
  },
}));

const { default: ApprovePage } = await import("./page");
const { default: ConsentGrantedPage } = await import("../complete/page");
const { default: ConfirmConsentPage } = await import("../confirm/page");
const { default: ConsentErrorPage } = await import("../error/page");
const { metadata } = await import("../layout");
const token = "handoff.aaaa1111-1111-4111-8111-111111111111";
const props = { params: Promise.resolve({ token }) };

it("posts the token associated with the rendered confirmation", async () => {
  const tid = "bbbb2222-2222-4222-8222-222222222222";
  readHandoffProof.mockResolvedValue({ phase: "confirm", token, tid });
  loadPendingHandoff.mockResolvedValue({
    state: { tid },
    workspace: { name: "Sample Workspace" },
  });
  const html = renderToStaticMarkup(await ConfirmConsentPage());
  expect(html).toContain('name="intent" value="confirm"');
  expect(html).toContain(`name="token" value="${token}"`);
});

it("tells the approver to retry when the permissions are still propagating", async () => {
  const html = renderToStaticMarkup(
    await ConsentErrorPage({
      searchParams: Promise.resolve({ error: "consent_pending" }),
    }),
  );
  expect(html).toContain(
    "Microsoft has not finished granting access. Try again in a few minutes.",
  );
});

it("renders the requester, workspace, and all connector permissions for a valid link", async () => {
  loadPendingHandoff.mockResolvedValue({
    state: { name: "Alex Rivera", email: "alex@example.com" },
    workspace: { name: "Contoso Test", tid: null },
  });
  const html = renderToStaticMarkup(await ApprovePage(props));
  expect(html).toContain("Alex Rivera");
  expect(html).toContain("Contoso Test");
  expect(html).toContain("Sign in with Microsoft");
  expect(html).toContain('action="/api/connect/approve"');
  expect(html).toContain('method="post"');
  expect(html).toContain(token);
  expect(html).toContain("example.com");
  expect(html).not.toContain("alex@example.com");
  for (const { scope } of CONNECTOR_SCOPES) expect(html).toContain(scope);
  expect(metadata.robots).toEqual({ index: false, follow: false });
  expect(metadata.referrer).toBe("same-origin");
});

it("redirects ineligible links to the public error page", async () => {
  loadPendingHandoff.mockResolvedValue(undefined);
  await expect(ApprovePage(props)).rejects.toThrow(
    "/connect/approve/error?error=invalid_state",
  );
});

it.each(["", "alex@example.com"])(
  "shows only the requester domain on public pages with display name %j",
  async (name) => {
    const state = {
      name,
      email: "alex@example.com",
      kind: "handoff",
      usedAt: new Date(),
    };
    loadPendingHandoff.mockResolvedValue({
      state,
      workspace: { name: "Sample Workspace" },
    });
    readHandoffCompletion.mockResolvedValue(token);
    loadConsentState.mockResolvedValue(state);
    const approval = renderToStaticMarkup(await ApprovePage(props));
    const completion = renderToStaticMarkup(await ConsentGrantedPage());
    expect(approval).toContain("A workspace admin (example.com)");
    expect(completion).toContain("The requester (example.com)");
    expect(approval).not.toContain("alex@example.com");
    expect(completion).not.toContain("alex@example.com");
  },
);
