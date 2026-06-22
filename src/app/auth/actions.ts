"use server";

import { redirect } from "next/navigation";

import { clearSessionCookie } from "~/server/auth";

export async function signOutAction() {
  // WorkOS sign-out clears its cookie and redirects internally (NEXT_REDIRECT);
  // the entra / demo path returns normally, so land it on the home page here.
  await clearSessionCookie();
  redirect("/");
}
