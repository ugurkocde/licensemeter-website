"use server";

import { redirect } from "next/navigation";

import { clearSessionCookie, revokeCurrentSession } from "~/server/auth";

export async function signOutAction() {
  // Expires the LicenseMeter session cookie only. The person stays signed in
  // to Microsoft, which is their account and not ours to end.
  // Revoke server-side too, so a copy of the cookie cannot be replayed.
  await revokeCurrentSession().catch(() => undefined);
  await clearSessionCookie();
  redirect("/");
}
