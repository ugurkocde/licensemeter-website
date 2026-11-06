import type { Roundup } from "../types";
import { CURRENT, SOURCED } from "./shared";

export const copilotTools: Roundup = {
  slug: "unused-copilot-license-tools",
  title: {
    en: "How to find unused Microsoft 365 Copilot licenses: tools compared",
    de: "Ungenutzte Microsoft-365-Copilot-Lizenzen finden: Tools im Vergleich",
  },
  description: {
    en: "Where to see which Microsoft 365 Copilot seats nobody uses: the free Copilot usage report in the admin center, and what LicenseMeter, CIPP, CoreView, Torii and ENow add on top.",
    de: "Wo Sie sehen, welche Microsoft-365-Copilot-Lizenzen niemand nutzt: der kostenlose Copilot-Nutzungsbericht im Admin Center, und was LicenseMeter, CIPP, CoreView, Torii und ENow ergänzen.",
  },
  intro: [
    {
      en: "Microsoft gives you the data for free. In the Microsoft 365 admin center, Reports > Usage > Microsoft Copilot lists every Copilot-licensed user with their last Copilot activity, over the last 7, 28, 90 or 180 days, and exports to CSV. User names are hidden by default until a Global Administrator turns identifiable names back on.",
      de: "Microsoft liefert die Daten kostenlos. Im Microsoft 365 Admin Center listet Berichte > Nutzung > Microsoft Copilot jede Person mit Copilot-Lizenz und ihrer letzten Copilot-Aktivität auf, über die letzten 7, 28, 90 oder 180 Tage, mit CSV-Export. Namen sind standardmäßig ausgeblendet, bis ein Globaler Administrator sie wieder einblendet.",
    },
    {
      en: "Microsoft counts someone as active only after an intentional action, such as submitting a prompt; opening the Copilot pane does not count. A seat with no activity in your window is the candidate. The tools below differ in whether they put a cost on that seat, keep watching for new ones, or remove it for you.",
      de: "Microsoft zählt eine Person erst nach einer bewussten Aktion als aktiv, etwa einem abgeschickten Prompt; das Öffnen des Copilot-Bereichs zählt nicht. Eine Lizenz ohne Aktivität im gewählten Zeitraum ist der Kandidat. Die Tools unten unterscheiden sich darin, ob sie diese Lizenz beziffern, laufend nach neuen suchen oder sie für Sie entziehen.",
    },
  ],
  criteria: [
    {
      en: "It documents a report or rule for Microsoft 365 Copilot seats specifically, not just Copilot spend in general.",
      de: "Es dokumentiert einen Bericht oder eine Regel speziell für Microsoft-365-Copilot-Lizenzen, nicht nur Copilot-Ausgaben allgemein.",
    },
    CURRENT,
    SOURCED,
  ],
  entries: [
    {
      product: "m365-admin-center",
      bestFor: {
        en: "A free check, once, by hand.",
        de: "Eine kostenlose Prüfung, einmalig, von Hand.",
      },
      verdict: {
        en: "The source of truth for Copilot activity. It shows counts and dates, not cost, and only when you go and look.",
        de: "Die maßgebliche Quelle für Copilot-Aktivität. Sie zeigt Anzahlen und Daten, keine Kosten, und nur, wenn Sie nachsehen.",
      },
    },
    {
      product: "licensemeter",
      bestFor: {
        en: "Pricing idle Copilot seats and catching new ones every night, for free.",
        de: "Ungenutzte Copilot-Lizenzen beziffern und jede Nacht neue finden, kostenlos.",
      },
      verdict: {
        en: "Unused Copilot is its own finding, priced from your price book next to the rest of your Microsoft 365 waste. It does not remove the seat; it generates a script for your admin.",
        de: "Ungenutztes Copilot ist ein eigener Fund, beziffert aus Ihrer Preisliste neben der übrigen Microsoft-365-Verschwendung. Die Lizenz entzieht es nicht; es erzeugt ein Skript für Ihre Admins.",
      },
    },
    {
      product: "cipp",
      bestFor: {
        en: "MSPs who want to remove the seat from the same screen.",
        de: "MSPs, die die Lizenz direkt in derselben Ansicht entziehen wollen.",
      },
      verdict: {
        en: "Copilot activity and adoption reports, and the optimization tab suggests removing never-used Copilot with a monthly saving.",
        de: "Berichte zu Copilot-Aktivität und Einführung; der Optimierungsreiter schlägt vor, nie genutztes Copilot zu entziehen, mit Monatseinsparung.",
      },
    },
    {
      product: "coreview",
      bestFor: {
        en: "Enterprises that want Copilot policies inside a broader admin platform.",
        de: "Konzerne, die Copilot-Richtlinien in einer breiteren Admin-Plattform wollen.",
      },
      verdict: {
        en: "Policies for licensed users without Copilot activity or with low use over 30, 60 or 90 days, plus Copilot audit logs.",
        de: "Richtlinien für lizenzierte Personen ohne oder mit geringer Copilot-Aktivität über 30, 60 oder 90 Tage, dazu Copilot-Audit-Logs.",
      },
    },
    {
      product: "torii",
      bestFor: {
        en: "Companies tracking Copilot alongside their whole SaaS and AI stack.",
        de: "Unternehmen, die Copilot zusammen mit ihrem gesamten SaaS- und KI-Bestand verfolgen.",
      },
      verdict: {
        en: "With its AI module: prompts and active days per person, dormant seats with no prompts in 90 days, and cost from the price you record.",
        de: "Mit dem KI-Modul: Prompts und aktive Tage je Person, ruhende Lizenzen ohne Prompt in 90 Tagen und Kosten aus dem hinterlegten Preis.",
      },
    },
    {
      product: "enow",
      bestFor: {
        en: "Enterprises planning Copilot reallocation or training.",
        de: "Konzerne, die Umverteilung oder Schulung zu Copilot planen.",
      },
      verdict: {
        en: "A separate Copilot Center reports readiness and usage to find underusers.",
        de: "Ein separates Copilot Center berichtet über Bereitschaft und Nutzung, um wenig nutzende Personen zu finden.",
      },
    },
  ],
  featureKeys: [
    "copilotUsage",
    "m365InactiveUsers",
    "costPerFinding",
    "customPrices",
    "automatedRemediation",
    "freeTier",
    "publicPricing",
    "selfHost",
  ],
  updated: "2026-11-06",
};
