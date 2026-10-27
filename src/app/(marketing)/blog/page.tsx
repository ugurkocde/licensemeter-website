import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { siteUrl } from "~/env";
import { BLOG_POSTS, formatPostDate, readingMinutes } from "~/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Product news from LicenseMeter: new features, how they work and what they mean for Microsoft 365 and software license waste.",
  alternates: { canonical: "/blog" },
};

const BASE = siteUrl();

/* Static breadcrumb and blog entity; "<" escaped so nothing can terminate
 * the script. */
const INDEX_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Blog",
      "@id": `${BASE}/blog`,
      name: "LicenseMeter Blog",
      url: `${BASE}/blog`,
      publisher: { "@id": `${BASE}/#organization` },
      inLanguage: "en",
      blogPost: BLOG_POSTS.map((post) => ({
        "@type": "BlogPosting",
        headline: post.title,
        url: `${BASE}/blog/${post.slug}`,
        datePublished: post.publishedOn,
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: BASE },
        {
          "@type": "ListItem",
          position: 2,
          name: "Blog",
          item: `${BASE}/blog`,
        },
      ],
    },
  ],
};

const Meta = ({ post }: { post: (typeof BLOG_POSTS)[number] }) => (
  <p className="text-ink-faint flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
    <span className="bg-brand-soft text-brand-text rounded-full px-2.5 py-1">
      {post.tag}
    </span>
    <time dateTime={post.publishedOn}>{formatPostDate(post.publishedOn)}</time>
    <span aria-hidden="true">·</span>
    <span>{readingMinutes(post)} min read</span>
  </p>
);

export default function BlogIndexPage() {
  const [latest, ...older] = BLOG_POSTS;

  return (
    <main className="mx-auto max-w-5xl px-4 pt-10 pb-24 sm:px-6 sm:pt-14">
      <p className="text-brand-text text-xs font-medium tracking-[0.2em] uppercase">
        Blog
      </p>
      <h1 className="font-display mt-4 max-w-[20ch] text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.1] font-semibold tracking-[-0.04em] text-balance">
        What we are building, and why.
      </h1>
      <p className="text-ink-soft mt-5 max-w-2xl text-lg leading-relaxed text-pretty">
        Product news from LicenseMeter: new features, how they work, and what
        they mean for the licenses you pay for.
      </p>

      {latest && (
        <article className="border-line bg-card shadow-float group relative mt-12 overflow-hidden rounded-[28px] border">
          <div className="from-brand-soft bg-gradient-to-br via-white to-white p-6 sm:p-10">
            <Meta post={latest} />
            <h2 className="font-display mt-5 max-w-[24ch] text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-[2.25rem]">
              <Link
                href={`/blog/${latest.slug}`}
                className="after:absolute after:inset-0 after:content-['']"
              >
                {latest.title}
              </Link>
            </h2>
            <p className="text-ink-soft mt-4 max-w-2xl text-base leading-relaxed text-pretty sm:text-lg">
              {latest.excerpt}
            </p>
            <p className="text-ink group-hover:text-brand-text mt-7 inline-flex items-center gap-2 text-sm font-semibold transition-colors">
              Read the post
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </p>
          </div>
        </article>
      )}

      {older.length > 0 && (
        <section aria-labelledby="older-posts" className="mt-14">
          <h2
            id="older-posts"
            className="text-ink-faint text-xs font-medium tracking-[0.18em] uppercase"
          >
            Earlier posts
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {older.map((post) => (
              <article
                key={post.slug}
                className="border-line bg-card group relative rounded-2xl border p-6"
              >
                <Meta post={post} />
                <h3 className="mt-4 text-lg leading-snug font-semibold tracking-tight">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group-hover:text-brand-text after:absolute after:inset-0 after:content-['']"
                  >
                    {post.title}
                  </Link>
                </h3>
                <p className="text-ink-soft mt-2 text-sm leading-relaxed">
                  {post.excerpt}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(INDEX_LD).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
