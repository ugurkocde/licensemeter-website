import { connection } from "next/server";

import { siteUrl } from "~/env";
import { isPublicHttpsOrigin, securityTxt } from "~/lib/securityTxt";

/* RFC 9116 security.txt for the hosted service. A self-hosted instance is
 * operated by someone else, so it must not point reporters at us; like the
 * sitemap, it decides at request time. Without a public https origin the
 * Canonical and Policy URLs would be wrong, so nothing is served either. */
export async function GET(): Promise<Response> {
  const base = siteUrl();
  if (process.env.SELF_HOSTED === "true" || !isPublicHttpsOrigin(base)) {
    await connection();
    return new Response("Not found\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(securityTxt(base), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
