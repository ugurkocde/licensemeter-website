import { CONNECTOR_SCOPES } from "./scopes";

type ConnectorScope = (typeof CONNECTOR_SCOPES)[number]["scope"];

/**
 * One plain-language sentence per connector permission, for the sign-in page.
 * The permission list itself comes from CONNECTOR_SCOPES; this only adds the
 * reason. The Record type and signInSteps.test.ts both fail when a scope is
 * added without a line here.
 */
export const SCOPE_PLAIN_WHY: Record<ConnectorScope, string> = {
  "User.Read.All":
    "Lists the people in your directory, whether each account is enabled and which licenses it holds.",
  "AuditLog.Read.All":
    "Reads when each person last signed in, so a license nobody uses stands out. Microsoft provides this with Entra ID P1.",
  "Reports.Read.All":
    "Reads Microsoft's usage reports for the Microsoft 365 apps and Copilot: activity dates and counts, never mail or file content.",
  "LicenseAssignment.Read.All":
    "Reads how many seats you bought and how many of them are assigned.",
  "ReportSettings.Read.All":
    "Checks whether Microsoft hides user names in usage reports, so we can tell you when that limits a finding.",
};

/** The connector permissions with their plain-language reason, in source order. */
export const connectorPermissions = (): { scope: string; why: string }[] =>
  CONNECTOR_SCOPES.map((s) => ({
    scope: s.scope,
    why: SCOPE_PLAIN_WHY[s.scope],
  }));

export type SignInStepId = "signin" | "workspace" | "connect" | "results";

export type SignInStep = {
  id: SignInStepId;
  title: string;
  /** Time estimate, rendered as the small mono label next to the title. */
  time: string;
  /** Who is needed for the step, when it is not just the person signing in. */
  needs?: string;
  sentences: string[];
};

export const SIGN_IN_STEPS: SignInStep[] = [
  {
    id: "signin",
    title: "Sign in with Microsoft",
    time: "About 30 seconds",
    sentences: [
      "Use your work or school account. There is no signup form and no password for us to store.",
      "We receive your name, your email address and the IDs of your account and your organisation, and nothing else.",
      'Nothing in your tenant is read, and you normally need no admin rights. If Microsoft shows "Need admin approval", your organisation reviews every new app first: an admin can approve this sign-in, which covers your basic profile only.',
    ],
  },
  {
    id: "workspace",
    title: "Your workspace is ready",
    time: "Immediately",
    sentences: [
      "A workspace is created for you.",
      "If your organisation already has one, you join your colleagues there or ask them for access, depending on how they set it up.",
    ],
  },
  {
    id: "connect",
    title: "Connect Microsoft 365",
    time: "A few minutes",
    needs: "Needs an admin",
    sentences: [
      "One read-only admin consent, given by a Global Administrator or a Privileged Role Administrator.",
      "It is a second Microsoft dialog, for a separate app called LicenseMeter Connector: signing in alone never grants access to your tenant.",
      "LicenseMeter cannot change anything in your tenant: every permission below only reads. You can revoke the consent at any time in Entra, under Enterprise applications.",
    ],
  },
  {
    id: "results",
    title: "See what the unused licenses cost",
    time: "First scan: a few minutes",
    sentences: [
      "Every finding is priced per month, so you see what each unused license costs.",
      "You get a report to share and the scripts to fix what you decide to fix.",
      "Free, with no time limit.",
    ],
  },
];
