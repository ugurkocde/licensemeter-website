import { expect, test } from "./fixtures";

/**
 * Export downloads render real files. The PDF routes were once broken in the
 * built deployment (pdfkit assets missing from the serverless bundle) while
 * the unit suite passed, so this asserts the content type and file signature.
 * The authenticated export checks live in docker.spec.ts, which runs against
 * the built production image and is where the bundling regression appeared.
 */

test("the public DPA download is a PDF", async ({ request }) => {
  const res = await request.get("/api/export/dpa");
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
});
