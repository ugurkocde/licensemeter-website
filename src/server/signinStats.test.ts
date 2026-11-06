import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Db } from "~/server/db";

import { recordSignin } from "./signinStats";

const TABLE = `create table seen_signins (
  oid text primary key,
  tid text not null,
  upn text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  signin_count integer not null default 1`;

const setup = async (withSource: boolean) => {
  const client = new PGlite();
  await client.exec(`${TABLE}${withSource ? ", signup_source text" : ""})`);
  return { client, db: drizzle(client) as unknown as Db };
};

afterEach(() => vi.restoreAllMocks());

describe("recordSignin", () => {
  it("keeps the source of the first sign-in only", async () => {
    const { client, db } = await setup(true);
    const base = { oid: "o1", tid: "t1", upn: "a@example.test" };
    expect(await recordSignin(db, { ...base, signupSource: "/pricing" })).toBe(
      1,
    );
    expect(await recordSignin(db, { ...base, signupSource: "/blog" })).toBe(2);
    const { rows } = await client.query<{ signup_source: string | null }>(
      "select signup_source from seen_signins",
    );
    expect(rows).toEqual([{ signup_source: "/pricing" }]);
  });

  it("keeps counting when the signup_source column does not exist yet", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { db } = await setup(false);
    const base = { oid: "o2", tid: "t1", upn: "b@example.test" };
    expect(await recordSignin(db, { ...base, signupSource: "/compare" })).toBe(
      1,
    );
    expect(await recordSignin(db, { ...base, signupSource: null })).toBe(2);
  });
});
