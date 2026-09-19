"use server";

import { redirect } from "next/navigation";

import { clearSessionCookie } from "~/server/auth";

export async function signOutAction() {
  // Expires the LicenseMeter session cookie only. The person stays signed in
  // to Microsoft, which is their account and not ours to end.
  await clearSessionCookie();
  redirect("/");
}
