/** Raw shapes returned by Microsoft Graph plus the client interface the sync pipeline uses. */

export type GraphSubscribedSku = {
  skuId: string;
  skuPartNumber: string;
  capabilityStatus: string;
  consumedUnits: number;
  prepaidUnits: {
    enabled: number;
    suspended: number;
    warning: number;
  };
};

export type GraphLicenseAssignmentState = {
  skuId: string;
  assignedByGroup: string | null;
  disabledPlans: string[] | null;
  state: string;
};

export type GraphUser = {
  id: string;
  displayName: string | null;
  userPrincipalName: string;
  /** Primary SMTP address; may differ from the UPN or be null. */
  mail?: string | null;
  /** "smtp:alias@..." entries (uppercase SMTP marks the primary). */
  proxyAddresses?: string[] | null;
  accountEnabled: boolean;
  userType: string | null;
  createdDateTime: string | null;
  assignedLicenses: { skuId: string; disabledPlans: string[] }[];
  licenseAssignmentStates: GraphLicenseAssignmentState[] | null;
  signInActivity?: {
    lastSignInDateTime: string | null;
    lastNonInteractiveSignInDateTime: string | null;
  } | null;
};

/** One row of the Office 365 active user detail report (period D90). */
export type UsageReportRow = {
  userPrincipalName: string;
  exchangeLastActivityDate: string | null;
  oneDriveLastActivityDate: string | null;
  sharePointLastActivityDate: string | null;
  teamsLastActivityDate: string | null;
};

/** One row of the Microsoft 365 Copilot usage user detail report. */
export type CopilotUsageRow = {
  userPrincipalName: string;
  lastActivityDate: string | null;
};

/**
 * Thrown when the customer tenant lacks Entra ID P1/P2, which Graph requires
 * for the signInActivity property. The sync retries without sign-in data.
 */
export class PremiumLicenseRequiredError extends Error {
  constructor(message = "Tenant does not have Entra ID P1/P2") {
    super(message);
    this.name = "PremiumLicenseRequiredError";
  }
}

export class GraphHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "GraphHttpError";
  }
}

/**
 * Everything the sync pipeline needs from a tenant. Implemented by the real
 * MSAL-backed client and by the deterministic demo client.
 */
export interface GraphClient {
  /** Organization display name from /organization; null when unreadable. */
  getOrganizationName(): Promise<string | null>;
  getSubscribedSkus(): Promise<GraphSubscribedSku[]>;
  /** displayConcealedNames from /admin/reportSettings; null when unreadable. */
  getReportConcealment(): Promise<boolean | null>;
  /** Throws PremiumLicenseRequiredError when includeSignInActivity is true on a non-P1 tenant. */
  listUsers(opts: { includeSignInActivity: boolean }): Promise<GraphUser[]>;
  getActiveUserDetail(period: "D90"): Promise<UsageReportRow[]>;
  getCopilotUsage(period: "D90"): Promise<CopilotUsageRow[]>;
}

/** Concealed report rows carry a 32-hex MD5 hash instead of a UPN. */
export const isConcealedUpn = (upn: string): boolean =>
  /^[0-9a-f]{32}$/i.test(upn);
