#!/usr/bin/env node
/**
 * Publishes reviewed changelog entry files to the central Ugurlabs changelog.
 *
 * Reads .ugurlabs/changelog.json and every changelog/entries/*.json, validates
 * them against the public API contract, registers the product (idempotent
 * metadata upsert), then POSTs each entry. Idempotency keys make re-runs safe:
 * an entry that already exists returns created:false and nothing duplicates.
 *
 *   node scripts/changelog-publish.mjs --check   validate only, no network
 *   node scripts/changelog-publish.mjs           publish (CHANGELOG_PUBLISH_TOKEN)
 *
 * The token is read from the environment only. It is never logged, never
 * written to disk, and never sent anywhere but the configured API origin.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const API = "https://changelog.ugurlabs.com/api/changelog";
export const ENTRY_TYPES = ["new", "improved", "fixed", "maintenance"];
export const ENTRIES_DIR = "changelog/entries";

const bounded = (value, name, min, max) => {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  ) {
    throw new Error(`${name} must be a string of ${min} to ${max} characters`);
  }
  return value.trim();
};

/** Public HTTPS URL without credentials, IP hosts, or secret-looking queries. */
export const publicUrl = (value, name = "URL") => {
  const text = bounded(value, name, 1, 2000);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${name} is not a valid URL`);
  }
  const host = url.hostname;
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${name} must be a public HTTPS URL without credentials`);
  }
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) {
    throw new Error(`${name} must not use an IP address`);
  }
  if (!host.includes(".") || /\.(localhost|local|internal|lan)$/.test(host)) {
    throw new Error(`${name} must use a public hostname`);
  }
  for (const key of url.searchParams.keys()) {
    if (/key|token|secret|password|signature|^sig$/i.test(key)) {
      throw new Error(`${name} carries a sensitive query parameter`);
    }
  }
  return text;
};

export const readConfig = (raw) => {
  const config = JSON.parse(raw);
  if (config?.schemaVersion !== 1 || config.apiUrl !== API) {
    throw new Error(
      "Expected schemaVersion 1 and the central Ugurlabs API URL",
    );
  }
  const productId = bounded(config.productId, "productId", 2, 64);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productId)) {
    throw new Error("Invalid productId");
  }
  return {
    productId,
    productName: bounded(config.productName, "productName", 2, 120),
    websiteUrl: publicUrl(config.websiteUrl, "websiteUrl"),
  };
};

export const validateEntry = (entry, productId) => {
  const required = [
    "title",
    "summary",
    "type",
    "publishedOn",
    "idempotencyKey",
  ];
  const optional = ["sourceCommit", "sourceUrl"];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error("Entry must be a JSON object");
  }
  for (const key of required) {
    if (!(key in entry)) throw new Error(`Missing field: ${key}`);
  }
  for (const key of Object.keys(entry)) {
    if (!required.includes(key) && !optional.includes(key)) {
      throw new Error(`Unknown field: ${key}`);
    }
  }
  const out = {
    title: bounded(entry.title, "title", 3, 160),
    summary: bounded(entry.summary, "summary", 12, 2000),
    type: entry.type,
    publishedOn: entry.publishedOn,
    idempotencyKey: bounded(entry.idempotencyKey, "idempotencyKey", 8, 240),
  };
  if (!ENTRY_TYPES.includes(out.type)) {
    throw new Error(`type must be one of ${ENTRY_TYPES.join(", ")}`);
  }
  if (
    typeof out.publishedOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(out.publishedOn) ||
    new Date(`${out.publishedOn}T00:00:00Z`).toISOString().slice(0, 10) !==
      out.publishedOn
  ) {
    throw new Error("publishedOn must be a real YYYY-MM-DD date");
  }
  // The changelog API refuses an entry that looks like it carries personal
  // data, and an address in an example is the easy way to trip it. Catching it
  // here keeps the failure in the pull request instead of after the merge.
  for (const [field, value] of [
    ["title", out.title],
    ["summary", out.summary],
  ]) {
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(value)) {
      throw new Error(
        `${field} must not contain an email address: describe the mailbox instead`,
      );
    }
  }
  if (!out.idempotencyKey.startsWith(`${productId}:`)) {
    throw new Error(`idempotencyKey must start with "${productId}:"`);
  }
  if ("sourceCommit" in entry) {
    if (
      typeof entry.sourceCommit !== "string" ||
      !/^[a-fA-F0-9]{7,64}$/.test(entry.sourceCommit)
    ) {
      throw new Error("sourceCommit must be a 7 to 64 character hex string");
    }
    out.sourceCommit = entry.sourceCommit;
  }
  if ("sourceUrl" in entry && entry.sourceUrl !== null) {
    out.sourceUrl = publicUrl(entry.sourceUrl, "sourceUrl");
  }
  return out;
};

/** Loads and validates every entry file; duplicate keys across files fail. */
export const loadEntries = async (dir, productId) => {
  let names = [];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const keys = new Map();
  const entries = [];
  for (const name of names) {
    const file = join(dir, name);
    let entry;
    try {
      entry = validateEntry(
        JSON.parse(await readFile(file, "utf8")),
        productId,
      );
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
    const previous = keys.get(entry.idempotencyKey);
    if (previous) {
      throw new Error(`${file}: idempotencyKey already used by ${previous}`);
    }
    keys.set(entry.idempotencyKey, file);
    entries.push({ file, entry });
  }
  return entries;
};

const request = async (fetchImpl, method, url, body, token) => {
  // Defense in depth: the credential only ever travels to the configured origin.
  if (!url.startsWith(`${API}/`))
    throw new Error("Refusing an unexpected API destination");
  const response = await fetchImpl(url, {
    method,
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON body: reported through the status code below.
  }
  if (!response.ok) {
    const detail = json?.error ? `: ${json.error}` : "";
    throw new Error(
      `${method} ${url} returned HTTP ${response.status}${detail}`,
    );
  }
  return json;
};

/**
 * Registers the product and publishes every entry. Returns one result per
 * entry so callers (and the CI log) can tell new publications from replays.
 */
export const publishAll = async ({
  config,
  entries,
  token,
  fetchImpl = fetch,
  log = console.log,
}) => {
  const url = `${API}/${config.productId}`;
  const registration = await request(
    fetchImpl,
    "PUT",
    url,
    {
      productName: config.productName,
      websiteUrl: config.websiteUrl,
    },
    token,
  );
  if (registration?.product?.slug !== config.productId) {
    throw new Error("Registration response did not confirm the product");
  }
  log(`Registered ${config.productId} (${registration.product.name})`);
  const results = [];
  for (const { file, entry } of entries) {
    const result = await request(fetchImpl, "POST", url, entry, token);
    if (
      typeof result?.id !== "string" ||
      typeof result?.created !== "boolean"
    ) {
      throw new Error(
        `${file}: unexpected publish response; verify the feed before retrying`,
      );
    }
    const anchor = `https://changelog.ugurlabs.com/?product=${config.productId}#change-${encodeURIComponent(result.id.toLowerCase())}`;
    log(
      `${result.created ? "Published" : "Already published"} ${file} -> ${anchor}`,
    );
    results.push({ file, id: result.id, created: result.created });
  }
  return results;
};

const main = async () => {
  const check = process.argv.includes("--check");
  const config = readConfig(await readFile(".ugurlabs/changelog.json", "utf8"));
  const entries = await loadEntries(ENTRIES_DIR, config.productId);
  console.log(
    `${entries.length} entr${entries.length === 1 ? "y" : "ies"} valid for ${config.productId}`,
  );
  if (check) return;
  const token = process.env.CHANGELOG_PUBLISH_TOKEN;
  if (!token) throw new Error("CHANGELOG_PUBLISH_TOKEN is not set");
  const results = await publishAll({ config, entries, token });
  const created = results.filter((r) => r.created).length;
  console.log(
    `Done: ${created} new, ${results.length - created} already published`,
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    // Message only: never echo request internals that could contain the token.
    console.error(`changelog-publish: ${error.message}`);
    process.exitCode = 1;
  });
}
