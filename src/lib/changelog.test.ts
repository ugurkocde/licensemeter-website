import { describe, expect, it } from "vitest";

import {
  badgeLabel,
  CHANGELOG_SEEN_LIMIT,
  changelogEntryUrl,
  formatChangelogDate,
  markSeen,
  parseChangelogFeed,
  parseSeenIds,
  unreadCount,
} from "./changelog";

const feed = (overrides: Record<string, unknown> = {}) => ({
  product: {
    id: "licensemeter",
    name: "LicenseMeter",
    websiteUrl: "https://www.licensemeter.com/",
  },
  entries: [
    {
      id: "A1",
      title: "  Bulk actions  ",
      summary: "Act on findings in bulk.",
      type: "new",
      publishedOn: "2026-09-12",
      sourceUrl: "https://www.licensemeter.com/connectors",
    },
    {
      id: "B2",
      title: "Faster sync",
      summary: "Syncs finish sooner.",
      type: "improved",
      publishedOn: "2026-09-01",
      sourceUrl: null,
    },
  ],
  ...overrides,
});

describe("parseChangelogFeed", () => {
  it("returns trimmed entries without the change type", () => {
    const entries = parseChangelogFeed(feed());
    expect(entries).toEqual([
      {
        id: "A1",
        title: "Bulk actions",
        summary: "Act on findings in bulk.",
        publishedOn: "2026-09-12",
        sourceUrl: "https://www.licensemeter.com/connectors",
      },
      {
        id: "B2",
        title: "Faster sync",
        summary: "Syncs finish sooner.",
        publishedOn: "2026-09-01",
        sourceUrl: null,
      },
    ]);
    expect(entries[0]).not.toHaveProperty("type");
  });

  it("rejects feeds for another product or with an unexpected shape", () => {
    expect(() =>
      parseChangelogFeed(feed({ product: { id: "intuneget" } })),
    ).toThrow(/another product/);
    expect(() => parseChangelogFeed(null)).toThrow(/shape/);
    expect(() => parseChangelogFeed("<html>")).toThrow(/shape/);
    expect(() => parseChangelogFeed(feed({ entries: "nope" }))).toThrow(
      /entries/,
    );
  });

  it("skips malformed or duplicate entries and unsafe source links", () => {
    const entries = parseChangelogFeed(
      feed({
        entries: [
          { id: "ok", title: "T", summary: "S", publishedOn: "2026-01-02" },
          { id: "ok", title: "dup", summary: "S", publishedOn: "2026-01-02" },
          { id: "", title: "T", summary: "S", publishedOn: "2026-01-02" },
          { id: "bad-date", title: "T", summary: "S", publishedOn: "Jan 2" },
          { id: "no-title", summary: "S", publishedOn: "2026-01-02" },
          {
            id: "http",
            title: "T",
            summary: "S",
            publishedOn: "2026-01-02",
            sourceUrl: "http://example.com/x",
          },
          {
            id: "js",
            title: "T",
            summary: "S",
            publishedOn: "2026-01-02",
            sourceUrl: "javascript:alert(1)",
          },
          "garbage",
        ],
      }),
    );
    expect(entries.map((e) => e.id)).toEqual(["ok", "http", "js"]);
    expect(entries.every((e) => e.sourceUrl === null)).toBe(true);
  });

  it("accepts an empty feed", () => {
    expect(parseChangelogFeed(feed({ entries: [] }))).toEqual([]);
  });
});

describe("seen state", () => {
  const entries = parseChangelogFeed(feed());

  it("parses stored ids defensively", () => {
    expect(parseSeenIds(null)).toEqual([]);
    expect(parseSeenIds("{not json")).toEqual([]);
    expect(parseSeenIds('{"a":1}')).toEqual([]);
    expect(parseSeenIds('["A1", 2, null, "B2"]')).toEqual(["A1", "B2"]);
  });

  it("counts unread entries and marks displayed ones seen", () => {
    expect(unreadCount(entries, [])).toBe(2);
    const seen = markSeen(["old"], entries);
    expect(seen).toEqual(["A1", "B2", "old"]);
    expect(unreadCount(entries, seen)).toBe(0);
    expect(markSeen(seen, entries)).toEqual(seen);
  });

  it("caps the stored list", () => {
    const many = Array.from(
      { length: CHANGELOG_SEEN_LIMIT },
      (_, i) => `s${i}`,
    );
    const seen = markSeen(many, entries);
    expect(seen).toHaveLength(CHANGELOG_SEEN_LIMIT);
    expect(seen.slice(0, 2)).toEqual(["A1", "B2"]);
  });

  it("formats the badge", () => {
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(9)).toBe("9");
    expect(badgeLabel(10)).toBe("9+");
  });
});

describe("presentation helpers", () => {
  it("builds archive deep links with a lowercase encoded id", () => {
    expect(changelogEntryUrl("AbC 1")).toBe(
      "https://changelog.ugurlabs.com/?product=licensemeter#change-abc%201",
    );
  });

  it("formats dates per locale and tolerates bad input", () => {
    expect(formatChangelogDate("2026-09-12", "en")).toBe("12 Sept 2026");
    expect(formatChangelogDate("2026-09-12", "de")).toMatch(
      /12\. Sept\.? 2026/,
    );
    expect(formatChangelogDate("not-a-date", "en")).toBe("not-a-date");
  });
});
