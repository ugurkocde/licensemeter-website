import { securityTxtFor } from "~/lib/securityTxt";

const NOT_FOUND = () =>
  new Response("Not found\n", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

/* RFC 9116 security.txt, published only by the production deployment and only
 * on a hosted origin (HOSTED_ORIGINS). The origin is the host the request was
 * served on, so Canonical always lists the URL the file was retrieved from,
 * whether that is the apex or www. Previews and self-hosted instances are
 * operated or reached differently and must not point reporters at us. Reading
 * the request keeps the handler dynamic. */
export function GET(request: Request): Response {
  // Only the production deployment on Vercel publishes it (VERCEL_ENV is
  // exposed at runtime); local, preview and unset environments do not.
  if (
    process.env.VERCEL_ENV !== "production" ||
    process.env.SELF_HOSTED === "true"
  ) {
    return NOT_FOUND();
  }
  const host = request.headers.get("host");
  const body = host ? securityTxtFor(`https://${host}`) : null;
  if (body === null) return NOT_FOUND();
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
