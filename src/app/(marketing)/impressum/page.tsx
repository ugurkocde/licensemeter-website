import type { Metadata } from "next";

import { SUPPORT_EMAIL } from "~/lib/support";

export const metadata: Metadata = {
  title: "Impressum",
  robots: { index: false },
};

/*
 * § 5 DDG: company name, ladungsfähige Anschrift and Geschäftsführer are
 * filled. STILL REQUIRED before public launch: the Handelsregister HRB number.
 * If the UG is already registered, replace the "wird nach Eintragung ergänzt"
 * line with "Eingetragen im Handelsregister. Registernummer: HRB <Nummer>"; if
 * it is still in Gründung, the firm name must carry the "i.G." suffix. The
 * Umsatzsteuer-ID section is intentionally omitted until a USt-IdNr is issued
 * (§ 27a UStG requires it only "soweit vorhanden").
 */
export default function ImpressumPage() {
  return (
    <main lang="de" className="mx-auto max-w-3xl px-6 pt-6 pb-24">
      <h1 className="font-display text-4xl tracking-tight">Impressum</h1>

      <div className="text-ink-soft mt-8 flex flex-col gap-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-ink font-medium">Angaben gemäß § 5 DDG</h2>
          <p className="mt-2">
            UgurLabs UG (haftungsbeschränkt)
            <br />
            Fährstraße 217
            <br />
            40221 Düsseldorf
            <br />
            Deutschland
          </p>
        </section>

        <section>
          <h2 className="text-ink font-medium">Vertreten durch</h2>
          <p className="mt-2">Ugur Koc (Geschäftsführer)</p>
        </section>

        <section>
          <h2 className="text-ink font-medium">Kontakt</h2>
          <p className="mt-2">E-Mail: {SUPPORT_EMAIL}</p>
        </section>

        <section>
          <h2 className="text-ink font-medium">Registereintrag</h2>
          <p className="mt-2">
            Registergericht: Amtsgericht Düsseldorf
            <br />
            Handelsregisternummer (HRB): wird nach Eintragung ergänzt
          </p>
        </section>

        <section>
          <h2 className="text-ink font-medium">
            Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
          </h2>
          <p className="mt-2">Ugur Koc (Anschrift wie oben)</p>
        </section>

        <section>
          <h2 className="text-ink font-medium">Haftung für Inhalte</h2>
          <p className="mt-2">
            Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte
            auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach
            §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht
            verpflichtet, übermittelte oder gespeicherte fremde Informationen zu
            überwachen oder nach Umständen zu forschen, die auf eine
            rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung
            oder Sperrung der Nutzung von Informationen nach den allgemeinen
            Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist
            jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten
            Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden
            Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
          </p>
        </section>

        <section>
          <h2 className="text-ink font-medium">Haftung für Links</h2>
          <p className="mt-2">
            Unser Angebot enthält Links zu externen Websites Dritter, auf deren
            Inhalte wir keinen Einfluss haben. Deshalb können wir für diese
            fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der
            verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber
            der Seiten verantwortlich. Die verlinkten Seiten wurden zum
            Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft;
            rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung nicht
            erkennbar. Eine permanente inhaltliche Kontrolle der verlinkten
            Seiten ist ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht
            zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir
            derartige Links umgehend entfernen.
          </p>
        </section>

        <section>
          <h2 className="text-ink font-medium">Urheberrecht</h2>
          <p className="mt-2">
            Die durch den Seitenbetreiber erstellten Inhalte und Werke auf
            diesen Seiten unterliegen dem deutschen Urheberrecht. Die
            Vervielfältigung, Bearbeitung, Verbreitung und jede Art der
            Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der
            schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
            Downloads und Kopien dieser Seite sind nur für den privaten, nicht
            kommerziellen Gebrauch gestattet. Soweit die Inhalte auf dieser
            Seite nicht vom Betreiber erstellt wurden, werden die Urheberrechte
            Dritter beachtet. Sollten Sie dennoch auf eine
            Urheberrechtsverletzung aufmerksam werden, bitten wir um einen
            entsprechenden Hinweis. Bei Bekanntwerden von Rechtsverletzungen
            werden wir derartige Inhalte umgehend entfernen.
          </p>
        </section>

        {/*
         * Verbraucherstreitbeilegung: the EU Online-Streitbeilegung (OS)
         * platform was permanently shut down on 20 July 2025, so the old
         * ec.europa.eu/consumers/odr link is deliberately omitted. The § 36
         * VSBG non-participation statement remains required.
         */}
        <section>
          <h2 className="text-ink font-medium">
            Verbraucherstreitbeilegung / Universalschlichtungsstelle
          </h2>
          <p className="mt-2">
            Wir sind nicht bereit und nicht verpflichtet, an
            Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
            teilzunehmen.
          </p>
        </section>

        <section>
          <h2 className="text-ink font-medium">Hinweis</h2>
          <p className="mt-2">
            LicenseMeter ist ein unabhängiges Produkt und steht in keiner
            Verbindung zur Microsoft Corporation. Microsoft, Microsoft 365 und
            Entra ID sind Marken der Microsoft Corporation.
          </p>
        </section>
      </div>
    </main>
  );
}
