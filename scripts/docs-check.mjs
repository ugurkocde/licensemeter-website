import fs from "node:fs";
import path from "node:path";

const root = path.resolve("docs/gitbook");
const files = fs
  .readdirSync(root, { recursive: true })
  .filter((f) => f.endsWith(".md"));
const failures = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (text.includes("—")) failures.push(`${file}: contains an em dash`);
  for (const match of text.matchAll(/(?:\]\(|(?:href|src)=")([^\s")]+)[")]/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    const resolved = path.resolve(root, path.dirname(file), target);
    if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) {
      failures.push(`${file}: unresolved local link ${target}`);
    }
  }
  for (const block of ["stepper", "step", "hint", "tabs", "tab"]) {
    const opens = [...text.matchAll(new RegExp(`{% ${block}(?: |%)`, "g"))]
      .length;
    const closes = [...text.matchAll(new RegExp(`{% end${block} %}`, "g"))]
      .length;
    if (opens !== closes) failures.push(`${file}: unbalanced ${block} blocks`);
  }
}
const summary = fs.readFileSync(path.join(root, "SUMMARY.md"), "utf8");
for (const file of files.filter((f) => f !== "SUMMARY.md")) {
  if (!summary.includes(`](${file})`))
    failures.push(`${file}: missing from navigation`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${files.length - 1} pages: local links, assets, navigation and block delimiters.`,
  );
}
