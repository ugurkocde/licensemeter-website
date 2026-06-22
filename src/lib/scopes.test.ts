import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONNECTOR_SCOPES } from "./scopes";

/**
 * The BYO setup script and the runtime test-connection must require exactly the
 * same Microsoft Graph application permissions, with no drift. scopes.ts is the
 * single source of truth; this asserts the customer-facing PowerShell script
 * lists byte-for-byte the same set.
 */
describe("BYO connector scopes have no drift", () => {
  it("setup-byo-connector.ps1 $connectorRoles matches CONNECTOR_SCOPES", () => {
    const script = readFileSync(
      join(process.cwd(), "scripts", "setup-byo-connector.ps1"),
      "utf8",
    );
    const block = /\$connectorRoles\s*=\s*@\(([^)]*)\)/.exec(script);
    expect(block, "could not find $connectorRoles array in the script").not.toBeNull();
    const scriptScopes = [...block![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

    const expected = CONNECTOR_SCOPES.map((s) => s.scope);
    expect(scriptScopes.slice().sort()).toEqual(expected.slice().sort());
  });
});
