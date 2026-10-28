import { DrizzleQueryError } from "drizzle-orm/errors";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { errText } from "~/server/sync/errText";

describe("errText", () => {
  let log: MockInstance<typeof console.error>;
  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it("stores the Postgres message of a failed query, not the SQL", () => {
    const sql = `insert into "saas_seats" (${"$1, ".repeat(400)}) on conflict do update`;
    const err = new DrizzleQueryError(
      sql,
      ["secret@example.com"],
      new Error(
        "ON CONFLICT DO UPDATE command cannot affect row a second time",
      ),
    );

    const text = errText(err);

    expect(text).toBe(
      "Database error: ON CONFLICT DO UPDATE command cannot affect row a second time",
    );
    expect(log).toHaveBeenCalledWith("[sync]", text);
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret@example.com");
  });

  it("keeps the message of other errors, even when they have a cause", () => {
    const err = new Error("Graph request failed: 403", {
      cause: new Error("token request body"),
    });
    expect(errText(err)).toBe("Graph request failed: 403");
  });

  it("caps the stored text at 300 characters and stringifies non-errors", () => {
    expect(errText(new Error("x".repeat(500)))).toHaveLength(300);
    expect(errText("timeout")).toBe("timeout");
  });
});
