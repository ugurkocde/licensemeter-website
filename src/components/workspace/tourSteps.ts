export type TourStep = {
  anchor: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
};

export const welcomeTourSteps: TourStep[] = [
  {
    anchor: "connect-cta",
    title: "Welcome to LicenseMeter",
    body: "Start here — connect Microsoft 365 (or upload a CSV) and LicenseMeter finds your license waste automatically.",
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
    anchor: "nav-findings",
    title: "Findings are concrete savings",
    body: "Each finding is one actionable saving: an inactive user, a duplicate license, an unused seat.",
    placement: "right",
  },
  {
    anchor: "nav-settings",
    title: "Cover your whole stack",
    body: "Add more connectors — Adobe, Zoom, Atlassian, Salesforce and more — under Settings.",
    placement: "right",
  },
  {
    anchor: "metric-info",
    title: "Explainers everywhere",
    body: "Unsure what a metric means? Every card has an explainer behind the i button.",
    placement: "bottom",
  },
];
