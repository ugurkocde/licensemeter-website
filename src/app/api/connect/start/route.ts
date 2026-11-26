import { redirect } from "next/navigation";

import { env } from "~/env";
import { apiAccess } from "~/server/access";
import { auth } from "~/server/auth";
import {
  createSelfConsentState,
  microsoftConsentUrl,
} from "~/server/consentState";

/**
 * Kicks off the one-time admin-consent flow for the connector app.
 * A state nonce binds the eventual callback to the initiating user.
 */
export const GET = async () => {
  const session = await auth();
  const user = session?.user;
  if (!user?.oid) redirect("/");
  if (user.isDemo) redirect("/app");
  if (!env.CONNECTOR_CLIENT_ID) redirect("/app/connect?error=not_configured");

  // Pin the consent to the workspace it starts from so the callback cannot
  // attach the tenant to a different active workspace. Everyone has a
  // workspace from their first sign-in on; connecting needs the admin role.
  const ctx = await apiAccess("admin");
  if (!ctx) redirect("/app/connectors/microsoft?error=not_allowed");

  const state = crypto.randomUUID();
  await createSelfConsentState({
    state,
    tenantId: ctx.tenant.id,
    oid: user.oid,
    tid: user.tid,
    email: user.upn !== "" ? user.upn : (user.email ?? ""),
    name: user.name ?? null,
  });

  redirect(microsoftConsentUrl(state));
};
