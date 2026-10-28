export type TourStep = {
  anchor: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
};

/** Sidebar anchors the tour can point at; NavLinks renders the same values. */
export const NAV_TOUR_ANCHORS = {
  findings: "nav-findings",
  metering: "nav-metering",
  connectors: "nav-connectors",
} as const;

export const welcomeTourSteps: TourStep[] = [
  {
    anchor: "connect-cta",
    title: "Welcome to LicenseMeter",
    body: "Start here: connect Microsoft 365 (or upload a CSV) and LicenseMeter finds your license waste automatically.",
    placement: "bottom",
  },
];

export const dataTourSteps: TourStep[] = [
  {
    anchor: "waste-card",
    title: "Your waste, right now",
    body: "This is what you're overpaying this month. Annualized waste projects it over 12 months.",
    placement: "bottom",
  },
  {
    anchor: "trend",
    title: "Spend and waste over time",
    body: "Watch this drop as you act on findings.",
    placement: "top",
  },
  {
    anchor: NAV_TOUR_ANCHORS.findings,
    title: "Findings are concrete savings",
    body: "Each finding is one actionable saving: an inactive user, a duplicate license, an unused seat.",
    placement: "right",
  },
  {
    anchor: NAV_TOUR_ANCHORS.metering,
    title: "Installed is not the same as used",
    body: "Software Metering shows which Windows apps you deploy through Intune are installed on devices, and whether they were started. An app installed everywhere but started nowhere is the desktop twin of an unused seat.",
    placement: "right",
  },
  {
    anchor: NAV_TOUR_ANCHORS.connectors,
    title: "Cover your whole stack",
    body: "Open Connectors to connect Adobe, Zoom, Atlassian, Salesforce and the rest of your stack.",
    placement: "right",
  },
  {
    anchor: "metric-info",
    title: "Explainers everywhere",
    body: "Unsure what a metric means? Every card has an explainer behind the i button.",
    placement: "bottom",
  },
];
