import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { METERING_MAX_PROGRAMS, PROGRAM } from "~/lib/metering";
import type { MeteringApp } from "./graph";

/**
 * Program files of widely licensed Windows software, matched on the Intune app
 * name. Intune rarely records which program an app starts, so this is the main
 * source; detection rules and admin entries fill the rest. Order matters: the
 * first match wins.
 */
const KNOWN_APPS: { match: RegExp; programs: string[] }[] = [
  {
    match: /acrobat reader|adobe reader/i,
    programs: ["acrord32.exe", "acrobat.exe"],
  },
  { match: /acrobat/i, programs: ["acrobat.exe"] },
  { match: /photoshop/i, programs: ["photoshop.exe"] },
  { match: /illustrator/i, programs: ["illustrator.exe"] },
  { match: /indesign/i, programs: ["indesign.exe"] },
  { match: /premiere pro/i, programs: ["adobe premiere pro.exe"] },
  { match: /after effects/i, programs: ["afterfx.exe"] },
  { match: /lightroom classic/i, programs: ["lightroom.exe"] },
  { match: /creative cloud/i, programs: ["creative cloud.exe"] },
  { match: /autocad/i, programs: ["acad.exe"] },
  { match: /revit/i, programs: ["revit.exe"] },
  { match: /3ds max/i, programs: ["3dsmax.exe"] },
  { match: /\binventor\b/i, programs: ["inventor.exe"] },
  { match: /solidworks/i, programs: ["sldworks.exe"] },
  { match: /matlab/i, programs: ["matlab.exe"] },
  { match: /tableau desktop/i, programs: ["tableau.exe"] },
  { match: /power bi desktop/i, programs: ["pbidesktop.exe"] },
  { match: /sap gui|saplogon/i, programs: ["saplogon.exe"] },
  { match: /\bvisio\b/i, programs: ["visio.exe"] },
  {
    match: /microsoft project|\bproject (professional|standard)\b/i,
    programs: ["winproj.exe"],
  },
  { match: /\bzoom\b/i, programs: ["zoom.exe"] },
  { match: /\bslack\b/i, programs: ["slack.exe"] },
  {
    match: /microsoft teams|\bteams\b/i,
    programs: ["ms-teams.exe", "teams.exe"],
  },
  { match: /\bwebex\b/i, programs: ["ciscocollabhost.exe", "webexmta.exe"] },
  { match: /figma/i, programs: ["figma.exe"] },
  { match: /visual studio code|\bvs ?code\b/i, programs: ["code.exe"] },
  {
    match: /visual studio (professional|enterprise|community)/i,
    programs: ["devenv.exe"],
  },
  { match: /\b7-?zip\b/i, programs: ["7zfm.exe"] },
  { match: /notepad\+\+/i, programs: ["notepad++.exe"] },
  { match: /\bvlc\b/i, programs: ["vlc.exe"] },
  { match: /google chrome|^chrome\b/i, programs: ["chrome.exe"] },
  { match: /firefox/i, programs: ["firefox.exe"] },
  { match: /microsoft edge/i, programs: ["msedge.exe"] },
  { match: /\bbrave\b/i, programs: ["brave.exe"] },
  { match: /anydesk/i, programs: ["anydesk.exe"] },
  { match: /teamviewer/i, programs: ["teamviewer.exe"] },
  { match: /1password/i, programs: ["1password.exe"] },
  { match: /keepass/i, programs: ["keepass.exe"] },
  { match: /\bputty\b/i, programs: ["putty.exe"] },
  { match: /winscp/i, programs: ["winscp.exe"] },
  { match: /postman/i, programs: ["postman.exe"] },
  { match: /audacity/i, programs: ["audacity.exe"] },
  { match: /draw\.io/i, programs: ["draw.io.exe"] },
  { match: /foxit pdf reader/i, programs: ["foxitpdfreader.exe"] },
  { match: /foxit pdf editor/i, programs: ["foxitpdfeditor.exe"] },
  { match: /greenshot/i, programs: ["greenshot.exe"] },
  { match: /ccleaner/i, programs: ["ccleaner64.exe", "ccleaner.exe"] },
  { match: /onedrive/i, programs: ["onedrive.exe"] },
];

/** Microsoft 365 Apps: the suite, plus Visio and Project as separately licensed apps. */
const OFFICE_PROGRAMS = [
  "winword.exe",
  "excel.exe",
  "powerpnt.exe",
  "outlook.exe",
  "onenote.exe",
  "msaccess.exe",
  "mspub.exe",
];

export type ProgramSource = "admin" | "detection" | "catalog" | "none";
export interface CatalogEntry {
  /**
   * Stable entry id: the lowest Intune app id of the group, or
   * "<app id>:visio" for a suite product. Settings are keyed by it.
   */
  id: string;
  /** Intune apps whose install status applies; duplicates share one entry. */
  appIds: string[];
  name: string;
  publisher: string;
  programs: string[];
  source: ProgramSource;
  excluded: boolean;
}
export interface CatalogSettings {
  excludedApps: string[];
  programOverrides: Record<string, string[]>;
}

const unique = (values: string[]) =>
  [...new Set(values.map((value) => value.toLowerCase()))].filter((value) =>
    PROGRAM.test(value),
  );

function knownPrograms(app: MeteringApp): string[] {
  return KNOWN_APPS.find((known) => known.match.test(app.name))?.programs ?? [];
}

/** Every assigned Windows app, with the program files LicenseMeter will watch. */
export function buildCatalog(
  apps: MeteringApp[],
  settings: CatalogSettings,
): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  const add = (
    id: string,
    group: MeteringApp[],
    name: string,
    fallback: string[],
  ) => {
    const app = group[0]!;
    const manual = unique(settings.programOverrides[id] ?? []);
    const detected = unique(group.flatMap((member) => member.detected));
    const known = unique(fallback);
    const [programs, source]: [string[], ProgramSource] = manual.length
      ? [manual, "admin"]
      : detected.length
        ? [detected, "detection"]
        : known.length
          ? [known, "catalog"]
          : [[], "none"];
    entries.push({
      id,
      appIds: group.map((member) => member.id),
      name,
      publisher: app.publisher,
      programs,
      source,
      excluded: settings.excludedApps.includes(id),
    });
  };
  // The same software is often assigned several times (versions, rings).
  // One row per name and publisher keeps the list readable.
  const groups = new Map<string, MeteringApp[]>();
  for (const app of apps) {
    if (app.type === "officeSuiteApp") {
      add(app.id, [app], app.name, OFFICE_PROGRAMS);
      const products = app.products.map((product) => product.toLowerCase());
      if (products.some((product) => product.startsWith("visio")))
        add(`${app.id}:visio`, [app], "Microsoft Visio", ["visio.exe"]);
      if (products.some((product) => product.startsWith("project")))
        add(`${app.id}:project`, [app], "Microsoft Project", ["winproj.exe"]);
      continue;
    }
    const key = `${app.name.trim().toLowerCase()}|${app.publisher.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), app]);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.id.localeCompare(b.id));
    add(group[0]!.id, group, group[0]!.name, knownPrograms(group[0]!));
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** The program files one collector version watches, sorted and capped. */
export function catalogPrograms(entries: CatalogEntry[]): string[] {
  return [
    ...new Set(
      entries.filter((entry) => !entry.excluded).flatMap((e) => e.programs),
    ),
  ]
    .sort()
    .slice(0, METERING_MAX_PROGRAMS);
}

/** Stable short id of a program list; the collector reports it as "c". */
export function catalogId(programs: string[]): string {
  return createHash("sha256")
    .update([...programs].sort().join("\n"))
    .digest("hex")
    .slice(0, 8);
}

/** The collector release in the template; deployed copies below it are offered an update. */
export const COLLECTOR_RELEASE = 3;

const TEMPLATE = path.join(
  process.cwd(),
  "src/server/metering/Collect-LicenseMeterUsage.template.ps1",
);

/** The collector script for one program list. Names are validated, so no quoting tricks reach it. */
export async function collectorScript(programs: string[]): Promise<string> {
  if (programs.some((name) => !PROGRAM.test(name)))
    throw new Error("Invalid program name");
  const template = await readFile(TEMPLATE, "utf8");
  const list = programs
    .map((name) => `'${name.replace(/'/g, "''")}'`)
    .join(",");
  const script = template
    .replace(
      "$CatalogId = 'LM_CATALOG_ID'",
      `$CatalogId = '${catalogId(programs)}'`,
    )
    .replace("$Programs = @('LM_PROGRAMS')", `$Programs = @(${list})`);
  if (script.includes("LM_CATALOG_ID") || script.includes("LM_PROGRAMS"))
    throw new Error("Collector template changed");
  // Windows PowerShell 5.1 reads BOM-less files as ANSI; keep the script ASCII.
  if (/[^\x00-\x7f]/.test(script)) throw new Error("Collector must be ASCII");
  return script.replace(/\r?\n/g, "\r\n");
}
