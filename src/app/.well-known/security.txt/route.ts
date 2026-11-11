import { connection } from "next/server";

import { siteUrl } from "~/env";
import { securityTxt } from "~/lib/securityTxt";

/* RFC 9116 security.txt for the hosted service. A self-hosted instance is
 * operated by someone else, so it must not point reporters at us; like the
 * sitemap, it decides at request time. */
export async function GET(): Promise<Response> {
  if (process.env.SELF_HOSTED === "true") {
    await connection();
    return new Response("Not found\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(securityTxt(siteUrl()), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
