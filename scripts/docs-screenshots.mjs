import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

// Run only against a dedicated local sample instance, without real credentials.
const base = new URL(process.argv[2] ?? "http://localhost:3217");
if (base.hostname !== "localhost" || base.protocol !== "http:") {
  throw new Error("Use an isolated localhost sample instance over HTTP.");
}
const wrapper = path.join(
  os.homedir(),
  ".codex/skills/playwright/scripts/playwright_cli.sh",
);
const session = "licensemeter-docs-capture";
const raw = path.resolve("output/playwright/licensemeter-docs");
const assets = path.resolve("docs/gitbook/.gitbook/assets");
fs.mkdirSync(raw, { recursive: true });
fs.mkdirSync(assets, { recursive: true });
const shots = [
  ["overview", "/app"],
  ["findings", "/app/findings"],
  ["licenses-prices", "/app/licenses"],
  ["renewals", "/app/renewals"],
  ["ai-costs", "/app/ai-costs"],
  ["connectors", "/app/connectors"],
  ["settings", "/app/settings"],
  ...[
    "microsoft",
    "adobe",
    "zoom",
    "atlassian",
    "salesforce",
    "openai",
    "anthropic",
    "chatgpt",
    "claude",
  ].map((name) => [`connector-${name}`, `/app/connectors/${name}`]),
];
const cli = (...args) =>
  execFileSync(wrapper, ["--session", session, ...args], { stdio: "inherit" });
try {
  cli("open", base.origin);
  cli(
    "run-code",
    `async (page) => {
    await page.setViewportSize({width:1440,height:1080});
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.getByRole("button", {name:"Open the sample tenant",exact:true}).first().click();
    await page.waitForURL("**/app");
    await page.keyboard.press("Escape");
    for (const [name, route] of ${JSON.stringify(shots)}) {
      await page.goto(${JSON.stringify(base.origin)} + route);
      await page.locator("h1").waitFor();
      await page.getByRole("complementary").getByText("Demo workspace", {exact:true}).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:${JSON.stringify(raw)}+"/"+name+".png",animations:"disabled"});
    }
  }`,
  );
  for (const [name] of shots) {
    await sharp(path.join(raw, `${name}.png`))
      .webp({ quality: 85 })
      .toFile(path.join(assets, `${name}.webp`));
  }
  console.log(
    `Captured ${shots.length} sample screenshots. Visually inspect them before publishing.`,
  );
} finally {
  cli("close");
}
