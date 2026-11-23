import { afterEach, beforeEach, expect, it, vi } from "vitest";

const hosted = "https://www.licensemeter.com";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("APP_BASE_URL", "https://licensemeter.com");
  vi.stubEnv("SELF_HOSTED", undefined);
  vi.stubEnv("PUBLIC_SITE_URL", undefined);
});

afterEach(() => vi.unstubAllEnvs());

it("uses www for all locations and the corresponding hreflang URLs", async () => {
  const { default: sitemap } = await import("./sitemap");
  const entries = await sitemap();

  expect(entries.every(({ url }) => new URL(url).origin === hosted)).toBe(true);
  for (const path of ["/pricing", "/compare/cipp"]) {
    const languages = { en: `${hosted}${path}`, de: `${hosted}/de${path}` };
    for (const url of Object.values(languages)) {
      expect(
        entries.find((entry) => entry.url === url)?.alternates?.languages,
      ).toEqual(languages);
    }
  }

  const { default: robots } = await import("./robots");
  expect((await robots()).sitemap).toBe(`${hosted}/sitemap.xml`);
});

it("uses editorial dates and omits lastmod on undated pages", async () => {
  const { default: sitemap } = await import("./sitemap");
  const entries = await sitemap();
  const byPath = new Map(
    entries.map((entry) => [new URL(entry.url).pathname, entry]),
  );

  const datedPages = [
    ["/blog/software-metering", "2026-10-27"],
    ["/compare/cipp", "2026-11-06"],
    ["/de/compare/cipp", "2026-11-06"],
    ["/compare/coreview-alternatives", "2026-11-06"],
    ["/de/compare/coreview-alternatives", "2026-11-06"],
    ["/dpa", "2026-11-11"],
    ["/de/sla", "2026-11-13"],
  ] as const;
  for (const [path, lastModified] of datedPages) {
    expect(byPath.get(path)).toHaveProperty("lastModified", lastModified);
  }
  for (const path of [
    "/",
    "/pricing",
    "/privacy",
    "/blog",
    "/compare",
    "/compare/m365-admin-center",
  ]) {
    expect(byPath.has(path)).toBe(true);
    expect(byPath.get(path)).not.toHaveProperty("lastModified");
  }
});

it("prefers a post's update date when present", async () => {
  const { BLOG_POSTS } = await import("~/lib/blog");
  const post = BLOG_POSTS[0]!;
  const { updatedOn } = post;
  post.updatedOn = "2026-11-08";
  try {
    const { default: sitemap } = await import("./sitemap");
    const entry = (await sitemap()).find(
      ({ url }) => url === `${hosted}/blog/${post.slug}`,
    );
    expect(entry?.lastModified).toBe("2026-11-08");
  } finally {
    post.updatedOn = updatedOn;
  }
});
