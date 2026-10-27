import { describe, expect, it } from "vitest";

import {
  ANNOUNCED_POST,
  BLOG_POSTS,
  blogPost,
  formatPostDate,
  readingMinutes,
} from "~/lib/blog";

/** Every visible string of a post, link targets excluded. */
const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, v]) =>
      key === "href" || key === "url" ? [] : strings(v),
    );
  }
  return [];
};

const links = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(links);
  if (value && typeof value === "object") {
    const own =
      "href" in value && typeof value.href === "string" ? [value.href] : [];
    return [...own, ...Object.values(value).flatMap(links)];
  }
  return [];
};

describe("blog posts", () => {
  it("have unique, URL-safe slugs and are sorted newest first", () => {
    const slugs = BLOG_POSTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const dates = BLOG_POSTS.map((p) => p.publishedOn);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("points the announcement banner at a real post", () => {
    expect(blogPost(ANNOUNCED_POST)).toBeDefined();
    expect(blogPost("missing")).toBeUndefined();
  });

  it("gives every section heading a unique anchor", () => {
    for (const post of BLOG_POSTS) {
      const ids = post.body.flatMap((b) => (b.type === "h2" ? [b.id] : []));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("follows the writing rules in every string", () => {
    for (const post of BLOG_POSTS) {
      for (const text of strings(post)) {
        expect(/—|–| - /.test(text), text).toBe(false);
      }
    }
  });

  it("links only to site paths or HTTPS", () => {
    for (const post of BLOG_POSTS) {
      for (const href of links(post)) expect(href).toMatch(/^(\/|https:\/\/)/);
    }
  });

  it("formats dates without a timezone shift and estimates reading time", () => {
    expect(formatPostDate("2026-10-27")).toBe("October 27, 2026");
    for (const post of BLOG_POSTS) {
      expect(readingMinutes(post)).toBeGreaterThanOrEqual(1);
    }
  });
});
