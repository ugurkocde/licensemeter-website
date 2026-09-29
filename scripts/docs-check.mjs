import fs from "node:fs";
import path from "node:path";

// Internal links, heading anchors and images are validated by the docs-site
// build (starlight-links-validator); this covers what the build does not.
const site = path.resolve("docs-site");
const root = path.join(site, "src/content/docs");
const files = fs
  .readdirSync(root, { recursive: true })
  .filter((f) => /\.mdx?$/.test(f));
const config = fs.readFileSync(path.join(site, "astro.config.mjs"), "utf8");
const slugs = new Set(
  [...config.matchAll(/slug: '([^']+)'/g)].map((m) => m[1]),
);
const failures = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (text.includes("—")) failures.push(`${file}: contains an em dash`);
  if (text.includes("{%")) failures.push(`${file}: contains GitBook syntax`);
  const slug = file
    .replace(/\\/g, "/")
    .replace(/\.mdx?$/, "")
    .replace(/(^|\/)index$/, "");
  // The home page is linked as { link: '/' } rather than by slug.
  if (slug && !slugs.has(slug)) failures.push(`${file}: missing from sidebar`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${files.length} pages: dashes, GitBook syntax and sidebar.`,
  );
}
