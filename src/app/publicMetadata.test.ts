import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", { spy: true });
vi.mock("geist/font/sans", () => ({ GeistSans: {} }));
vi.mock("geist/font/mono", () => ({ GeistMono: {} }));

const hosted = "https://www.licensemeter.com";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("APP_BASE_URL", "https://licensemeter.com");
  vi.stubEnv("SELF_HOSTED", undefined);
  vi.stubEnv("PUBLIC_SITE_URL", undefined);
});

afterEach(() => vi.unstubAllEnvs());

const jsonLd = (html: string) => {
  const script = /<script type="application\/ld\+json">([^<]+)<\/script>/.exec(
    html,
  );
  return JSON.parse(script![1]!) as { "@graph": Record<string, unknown>[] };
};

describe("public metadata", () => {
  it("uses the hosted origin for canonicals, hreflang and Open Graph", async () => {
    const { metadata: layout } = await import("./layout");
    const { metadata: germanPricing } =
      await import("./(marketing)/de/pricing/page");
    const { metadata: home } = await import("./(marketing)/page");

    expect(layout.metadataBase?.origin).toBe(hosted);
    expect(
      new URL(
        germanPricing.alternates!.canonical as string,
        layout.metadataBase!,
      ).href,
    ).toBe(`${hosted}/de/pricing`);
    expect(germanPricing.alternates?.languages).toEqual({
      en: "/pricing",
      de: "/de/pricing",
      "x-default": "/pricing",
    });
    expect(home.openGraph?.url).toBe(hosted);
  });

  it("uses the public override for discovery files", async () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://public.example.org/");
    const { default: robots } = await import("./robots");
    const { default: sitemap } = await import("./sitemap");
    const { GET } = await import("./llms.txt/route");

    expect((await robots()).sitemap).toBe(
      "https://public.example.org/sitemap.xml",
    );
    expect((await sitemap())[0]?.url).toBe("https://public.example.org");
    expect(await GET().text()).toContain(
      "German version at https://public.example.org/de/pricing",
    );
  });

  it("uses the public override in marketing JSON-LD", async () => {
    vi.stubEnv("PUBLIC_SITE_URL", "https://public.example.org");
    const { default: PricingPage } = await import("./(marketing)/pricing/page");
    const { "@graph": graph } = jsonLd(renderToStaticMarkup(PricingPage()));

    expect(graph).toContainEqual(
      expect.objectContaining({
        "@type": "BreadcrumbList",
        itemListElement: [
          expect.objectContaining({ item: "https://public.example.org" }),
          expect.objectContaining({
            item: "https://public.example.org/pricing",
          }),
        ],
      }),
    );
  });

  it("preserves a custom app origin without the self-hosting flag", async () => {
    vi.stubEnv("APP_BASE_URL", "https://private.example.org");
    const { metadata } = await import("./layout");
    const { default: sitemap } = await import("./sitemap");
    const { GET } = await import("./llms.txt/route");

    expect(metadata.metadataBase?.origin).toBe("https://private.example.org");
    expect((await sitemap())[0]?.url).toBe("https://private.example.org");
    expect(await GET().text()).toContain("(https://private.example.org/)");
  });

  it("keeps self-hosted pages on the app origin and keeps them out of the sitemap", async () => {
    vi.stubEnv("SELF_HOSTED", "true");
    vi.stubEnv("APP_BASE_URL", "https://private.example.org");
    const { connection } = await import("next/server");
    vi.mocked(connection).mockResolvedValue(undefined);
    const { metadata } = await import("./layout");
    const { default: robots } = await import("./robots");
    const { default: sitemap } = await import("./sitemap");
    const { GET } = await import("./llms.txt/route");

    expect(metadata.metadataBase?.origin).toBe("https://private.example.org");
    expect(await sitemap()).toEqual([]);
    expect(await robots()).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    });
    expect(await GET().text()).toContain("(https://private.example.org/)");
  });
});

describe("blog metadata", () => {
  it.each([undefined, "2026-11-08"])(
    "uses actual publication and modification dates when updatedOn is %s",
    async (updatedOn) => {
      const { blogPost } = await import("~/lib/blog");
      const { default: BlogPostPage, generateMetadata } =
        await import("./(marketing)/blog/[slug]/page");
      const slug = "software-metering";
      const post = blogPost(slug)!;
      const originalUpdatedOn = post.updatedOn;
      post.updatedOn = updatedOn;
      try {
        const props = { params: Promise.resolve({ slug }) };
        const metadata = await generateMetadata(props);
        const { "@graph": graph } = jsonLd(
          renderToStaticMarkup(await BlogPostPage(props)),
        );

        expect(metadata.openGraph).toMatchObject({
          url: `/blog/${slug}`,
          publishedTime: post.publishedOn,
          modifiedTime: updatedOn,
        });
        expect(graph).toContainEqual(
          expect.objectContaining({
            "@type": "BlogPosting",
            url: `${hosted}/blog/${slug}`,
            datePublished: post.publishedOn,
            dateModified: updatedOn ?? post.publishedOn,
          }),
        );
      } finally {
        post.updatedOn = originalUpdatedOn;
      }
    },
  );
});
