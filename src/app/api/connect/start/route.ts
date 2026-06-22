import { redirect } from "next/navigation";

import { appBaseUrl, env } from "~/env";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { consentStates } from "~/server/db/schema";

/**
 * Kicks off the one-time admin-consent flow for the connector app.
 * A state nonce binds the eventual callback to the initiating user.
 */
export const GET = async () => {
  const session = await auth();
  const user = session?.user;
  // Accept either login stack: entra carries oid, workos carries workosUserId.
  if (!user || (!user.oid && !user.workosUserId)) redirect("/");
  if (user.isDemo) redirect("/app");
  if (!env.CONNECTOR_CLIENT_ID) redirect("/app/connect?error=not_configured");

  const state = crypto.randomUUID();
  await db.insert(consentStates).values({
    state,
    // Exactly one identity is populated; the empty entra fields collapse to null
    // in workos mode and vice-versa.
    oid: user.oid || null,
    tid: user.tid || null,
    workosUserId: user.workosUserId ?? null,
    email: user.upn !== "" ? user.upn : (user.email ?? ""),
    name: user.name ?? null,
  });

  const url = new URL(
    "https://login.microsoftonline.com/organizations/v2.0/adminconsent",
  );
  url.searchParams.set("client_id", env.CONNECTOR_CLIENT_ID);
  url.searchParams.set("scope", "https://graph.microsoft.com/.default");
  url.searchParams.set("redirect_uri", `${appBaseUrl()}/api/connect/callback`);
  url.searchParams.set("state", state);

  redirect(url.toString());
};
