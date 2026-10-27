import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PostBody } from "~/components/blog/PostBody";
import { siteUrl } from "~/env";
import {
  BLOG_POSTS,
  blogPost,
  formatPostDate,
  readingMinutes,
} from "~/lib/blog";

type Params = { slug: string };

export const generateStaticParams = (): Params[] =>
  BLOG_POSTS.map((post) => ({ slug: post.slug }));

export const dynamicParams = false;

export const generateMetadata = async ({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> => {
  const post = blogPost((await params).slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    authors: [{ name: post.author.name, url: post.author.url }],
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.publishedOn,
      authors: [post.author.url],
    },
    twitter: { title: post.title, description: post.description },
  };
};

const BASE = siteUrl();

export default async function BlogPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const post = blogPost((await params).slug);
  if (!post) notFound();
  const url = `${BASE}/blog/${post.slug}`;
  const external = (href: string) => href.startsWith("http");

  /* Static article and breadcrumb; "<" escaped so nothing can terminate the
   * script. */
  const pageLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": url,
        headline: post.title,
        description: post.description,
        url,
        mainEntityOfPage: url,
        datePublished: post.publishedOn,
        dateModified: post.publishedOn,
        inLanguage: "en",
        author: {
          "@type": "Person",
          name: post.author.name,
          url: post.author.url,
        },
        publisher: { "@id": `${BASE}/#organization` },
        isPartOf: { "@id": `${BASE}/blog` },
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
          { "@type": "ListItem", position: 3, name: post.title, item: url },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 pb-24 sm:px-6 sm:pt-14">
      <nav
        aria-label="Breadcrumb"
        className="text-ink-faint text-xs font-medium tracking-[0.2em] uppercase"
      >
        <Link
          href="/blog"
          className="hover:text-ink underline-offset-4 hover:underline"
        >
          Blog
        </Link>{" "}
        /{" "}
        <span aria-current="page" className="text-brand-text">
          {post.tag}
        </span>
      </nav>

      <article>
        <header className="mt-6">
          <h1 className="font-display text-[clamp(2rem,5vw,3rem)] leading-[1.1] font-semibold tracking-[-0.04em] text-balance">
            {post.title}
          </h1>
          <p className="text-ink-soft mt-5 text-lg leading-relaxed text-pretty sm:text-xl">
            {post.excerpt}
          </p>
          <div className="border-line mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-y py-4 text-sm">
            <a
              href={post.author.url}
              className="text-ink font-semibold underline-offset-4 hover:underline"
            >
              {post.author.name}
            </a>
            <span className="text-ink-soft">{post.author.role}</span>
            <span className="text-ink-faint ml-auto flex items-center gap-2 text-xs font-medium">
              <time dateTime={post.publishedOn}>
                {formatPostDate(post.publishedOn)}
              </time>
              <span aria-hidden="true">·</span>
              <span>{readingMinutes(post)} min read</span>
            </span>
          </div>
        </header>

        <PostBody blocks={post.body} />
      </article>

      <section className="bg-ink mt-16 rounded-[20px] px-6 py-8 text-white md:p-10">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem] sm:leading-tight">
          {post.cta.title}
        </h2>
        <p className="mt-3 max-w-xl text-white/70">{post.cta.body}</p>
        <div className="mt-6 grid gap-2.5 sm:grid-cols-[max-content_max-content]">
          {[post.cta.primary, post.cta.secondary].map((action, i) => {
            const className =
              i === 0
                ? "bg-brand-bright text-brand-deep inline-flex min-h-12 touch-manipulation items-center justify-center rounded-xl px-5 py-3 text-[15px] font-semibold transition hover:bg-white"
                : "inline-flex min-h-12 touch-manipulation items-center justify-center rounded-xl border border-white/30 px-5 py-3 text-[15px] font-medium text-white transition hover:border-white";
            return external(action.href) ? (
              <a key={action.href} href={action.href} className={className}>
                {action.label}
              </a>
            ) : (
              <Link key={action.href} href={action.href} className={className}>
                {action.label}
              </Link>
            );
          })}
        </div>
      </section>

      <p className="mt-10">
        <Link
          href="/blog"
          className="text-ink-soft hover:text-ink text-sm font-medium underline-offset-4 hover:underline"
        >
          All posts
        </Link>
      </p>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(pageLd).replaceAll("<", "\\u003c"),
        }}
      />
    </main>
  );
}
