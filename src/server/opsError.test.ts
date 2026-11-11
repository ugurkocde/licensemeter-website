import { inspect } from "node:util";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import { dbErrorFields, OpsSafeError, opsErrorText } from "./opsError";

/** The fields a Postgres server error response always carries. */
const SERVER_FIELDS = {
  severity: "ERROR",
  routine: "_bt_check_unique",
  file: "nbtinsert.c",
};

/** A real query error whose Postgres cause echoes the rejected value. */
const echoingQueryError = async (): Promise<unknown> => {
  const db = drizzle(new PGlite());
  try {
    await db.execute(sql`select ${"Alex Example"}::integer`);
  } catch (err) {
    return err;
  }
  throw new Error("expected the query to fail");
};

describe("opsErrorText", () => {
  it("reduces a database error to its SQLSTATE, dropping echoed values", async () => {
    const err = await echoingQueryError();
    // The raw error does carry the value, in its cause and its params.
    expect(inspect(err, { depth: 5 })).toContain("Alex Example");

    expect(dbErrorFields(err)?.code).toBe("22P02");
    expect(opsErrorText(err)).toBe("Database error 22P02");
  });

  it("keeps allowlisted identifiers and drops anything else", () => {
    expect(
      opsErrorText({
        ...SERVER_FIELDS,
        code: "23505",
        constraint_name: "memberships_tenant_email_idx",
        table_name: "memberships",
        detail: "Key (email)=(alex@example.com) already exists.",
      }),
    ).toBe(
      "Database error 23505, constraint memberships_tenant_email_idx, table memberships",
    );
    expect(
      opsErrorText({
        ...SERVER_FIELDS,
        code: "23505",
        table_name: "Alex Example's table",
      }),
    ).toBe("Database error 23505");
  });

  it("does not mistake an HTTP-style code for a SQLSTATE", () => {
    expect(opsErrorText(new Error("Graph returned 503"))).toBe("Error");
    expect(opsErrorText("plain")).toBe("Non-error value thrown");
    expect(opsErrorText(Object.assign(new Error("x"), { code: "404" }))).toBe(
      "Error",
    );
  });
});

describe("opsErrorText for non-database errors", () => {
  it("never returns the message, only class name, status and codes", async () => {
    const { GraphHttpError } = await import("~/server/graph/types");
    expect(
      opsErrorText(
        new GraphHttpError(
          404,
          "Request_ResourceNotFound",
          "Alex Example not found",
        ),
      ),
    ).toBe("GraphHttpError HTTP 404 Request_ResourceNotFound");
    expect(
      opsErrorText(
        Object.assign(new Error("AADSTS7000215 for alex@example.com"), {
          errorCode: "invalid_client",
        }),
      ),
    ).toBe("Error invalid_client");
    expect(
      opsErrorText(
        new Error("fetch failed for Alex Example", {
          cause: Object.assign(new Error("x"), {
            code: "UND_ERR_CONNECT_TIMEOUT",
          }),
        }),
      ),
    ).toBe("Error UND_ERR_CONNECT_TIMEOUT");
    expect(
      opsErrorText(Object.assign(new Error("y"), { code: "has spaces Alex" })),
    ).toBe("Error");
  });
});

describe("OpsSafeError", () => {
  it("is the one error whose message reaches an alert", () => {
    expect(opsErrorText(new OpsSafeError("1 of 3 message(s) not sent"))).toBe(
      "1 of 3 message(s) not sent",
    );
  });
});

describe("opsErrorText with code-shaped personal data", () => {
  it("shows only known codes and conventional class names", async () => {
    const { GraphHttpError } = await import("~/server/graph/types");
    for (const code of ["Alex.Example", "alex_example", "ALEX_EXAMPLE"]) {
      expect(opsErrorText(new GraphHttpError(403, code, "x"))).toBe(
        "GraphHttpError HTTP 403",
      );
      expect(
        opsErrorText(Object.assign(new Error("x"), { errorCode: code })),
      ).toBe("Error");
      expect(
        opsErrorText(
          new Error("x", { cause: Object.assign(new Error("y"), { code }) }),
        ),
      ).toBe("Error");
    }
    const renamed = new Error("x");
    renamed.name = "AlexExample";
    expect(opsErrorText(renamed)).toBe("Error");
  });
});

describe("SQLSTATE provenance", () => {
  it("does not take a five-character provider code for a database error", async () => {
    const { GraphHttpError } = await import("~/server/graph/types");
    expect(opsErrorText(new GraphHttpError(403, "ALICE", "x"))).toBe(
      "GraphHttpError HTTP 403",
    );
    expect(
      opsErrorText(
        new Error("x", {
          cause: Object.assign(new Error("y"), { code: "ALICE" }),
        }),
      ),
    ).toBe("Error");
    expect(
      opsErrorText(
        Object.assign(new Error("x"), {
          code: "ALICE",
          severity: "ERROR",
          table_name: "alice",
        }),
      ),
    ).toBe("Error");
  });
});
