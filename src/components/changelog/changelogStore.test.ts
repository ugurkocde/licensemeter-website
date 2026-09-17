import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHANGELOG_STORAGE_KEY } from "~/lib/changelog";
import {
  getSnapshot,
  loadFeed,
  markDisplayed,
  resetChangelogStore,
  subscribe,
} from "./changelogStore";

type Listener = (event: {
  key: string | null;
  newValue: string | null;
}) => void;

const feed = (productId = "licensemeter") => ({
  product: { id: productId, name: "LicenseMeter", websiteUrl: "https://x.y/" },
  entries: [
    { id: "e1", title: "One", summary: "First.", publishedOn: "2026-09-10" },
    { id: "e2", title: "Two", summary: "Second.", publishedOn: "2026-09-01" },
  ],
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let storage: Map<string, string>;
let storageBroken: boolean;
let storageListeners: Listener[];

beforeEach(() => {
  resetChangelogStore();
  storage = new Map();
  storageBroken = false;
  storageListeners = [];
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    addEventListener: (type: string, listener: Listener) => {
      if (type === "storage") storageListeners.push(listener);
    },
    localStorage: {
      getItem: (key: string) => {
        if (storageBroken) throw new Error("denied");
        return storage.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (storageBroken) throw new Error("denied");
        storage.set(key, value);
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadFeed", () => {
  it("shares one request between concurrent callers and caches success", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(feed()));
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([loadFeed(), loadFeed()]);
    await loadFeed();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSnapshot().status).toBe("ready");
    expect(getSnapshot().entries.map((e) => e.id)).toEqual(["e1", "e2"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://changelog.ugurlabs.com/api/changelog/licensemeter?limit=20",
    );
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports errors for HTTP failures, foreign products, and bad JSON, then retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "down" }, 503))
      .mockResolvedValueOnce(jsonResponse(feed("intuneget")))
      .mockResolvedValueOnce(new Response("<html>", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(feed()));
    vi.stubGlobal("fetch", fetchMock);
    await loadFeed();
    expect(getSnapshot().status).toBe("error");
    await loadFeed(true);
    expect(getSnapshot().status).toBe("error");
    await loadFeed(true);
    expect(getSnapshot().status).toBe("error");
    await loadFeed(true);
    expect(getSnapshot().status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("notifies subscribers on every transition", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(feed())),
    );
    const seen: string[] = [];
    const unsubscribe = subscribe(() => seen.push(getSnapshot().status));
    await loadFeed();
    unsubscribe();
    expect(seen).toEqual(["loading", "ready"]);
  });
});

describe("read state", () => {
  it("hydrates from storage, persists displayed entries, and follows other tabs", async () => {
    storage.set(CHANGELOG_STORAGE_KEY, JSON.stringify(["e2"]));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(feed())),
    );
    subscribe(() => undefined);
    expect(getSnapshot().seen).toEqual(["e2"]);
    await loadFeed();
    markDisplayed(getSnapshot().entries);
    expect(getSnapshot().seen).toEqual(["e1", "e2"]);
    expect(JSON.parse(storage.get(CHANGELOG_STORAGE_KEY) ?? "[]")).toEqual([
      "e1",
      "e2",
    ]);
    storageListeners[0]?.({
      key: CHANGELOG_STORAGE_KEY,
      newValue: JSON.stringify(["e9"]),
    });
    expect(getSnapshot().seen).toEqual(["e9"]);
    storageListeners[0]?.({ key: "other", newValue: "x" });
    expect(getSnapshot().seen).toEqual(["e9"]);
  });

  it("keeps working in memory when storage is unavailable", async () => {
    storageBroken = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(feed())),
    );
    await loadFeed();
    expect(() => markDisplayed(getSnapshot().entries)).not.toThrow();
    expect(getSnapshot().seen).toEqual(["e1", "e2"]);
    expect(storage.size).toBe(0);
  });
});
