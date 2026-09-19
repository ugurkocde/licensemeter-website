import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { subprocessorRows, type DpaLang } from "~/lib/dpa";

/**
 * Sign-in is Microsoft Entra ID only. The former sign-in vendor must not come
 * back as a dependency or as a sub-processor. Its name is assembled here so a
 * repository-wide search for it stays empty.
 */
const VENDOR = ["work", "os"].join("");

type PackageJson = Record<
  "dependencies" | "devDependencies" | "optionalDependencies",
  Record<string, string> | undefined
>;

describe("the former sign-in vendor stays removed", () => {
  it("is not a package.json dependency", () => {
    const pkg = JSON.parse(
      readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
    ) as PackageJson;
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ];
    expect(names.filter((n) => n.startsWith(`@${VENDOR}-inc/`))).toEqual([]);
  });

  it.each<DpaLang>(["en", "de"])("is not a DPA sub-processor (%s)", (lang) => {
    const text = JSON.stringify(subprocessorRows(lang)).toLowerCase();
    expect(text).not.toContain(VENDOR);
  });
});
