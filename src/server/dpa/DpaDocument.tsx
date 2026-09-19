import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  annexLabel,
  buildDpa,
  type DpaBlock,
  type DpaCounterparty,
  type DpaLang,
} from "~/lib/dpa";
import type { SccBlock, SccListItem } from "~/lib/dpaClauses";

/**
 * The downloadable, pre-signed DPA / AVV, rendered server-side with
 * @react-pdf/renderer in the same ledger style as WasteReport.tsx. Built-in
 * Helvetica / Times-Roman cover German umlauts (WinAnsi), so no font
 * registration is needed. Content comes from the single source of truth in
 * ~/lib/dpa, so the PDF can never drift from the web page. The clauses are the
 * Commission's standard contractual clauses, printed as ~/lib/dpaClauses holds
 * them. With a counterparty it is the copy signed with a named company.
 */

const C = {
  canvas: "#fbfcfc",
  ink: "#0c1a17",
  inkSoft: "#3a4541",
  inkFaint: "#687772",
  line: "#e4eae8",
  brand: "#0f766e",
};

const s = StyleSheet.create({
  page: {
    backgroundColor: C.canvas,
    color: C.ink,
    paddingHorizontal: 46,
    paddingTop: 44,
    paddingBottom: 56,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    lineHeight: 1.5,
  },
  hRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: C.ink,
    paddingBottom: 10,
  },
  wordmark: { fontSize: 15, fontFamily: "Times-Roman" },
  brandWord: { color: C.brand },
  docTitle: { fontSize: 13, fontFamily: "Times-Roman", marginTop: 10 },
  docSub: { color: C.inkSoft, fontSize: 9, marginTop: 2 },
  meta: { color: C.inkSoft, fontSize: 8.5, textAlign: "right" },
  h2: {
    fontSize: 11.5,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingBottom: 3,
  },
  clauseTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 11,
  },
  p: { marginTop: 3, textAlign: "justify" },
  sectionLabel: {
    fontSize: 8,
    color: C.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 14,
  },
  partTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 7 },
  item: { flexDirection: "row", marginTop: 3 },
  itemMarker: { width: 20 },
  itemBody: { flex: 1 },
  partyHeading: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginTop: 8 },
  li: { flexDirection: "row", marginTop: 2, paddingRight: 6 },
  bullet: { width: 10, color: C.brand },
  liText: { flex: 1 },
  defRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 4,
  },
  defTerm: { width: 120, fontFamily: "Helvetica-Bold", paddingRight: 8 },
  defText: { flex: 1, color: C.inkSoft },
  tomGroup: { marginTop: 8 },
  tomTitle: { fontFamily: "Helvetica-Bold", fontSize: 9.5 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#f3f6f5",
    borderTopWidth: 1,
    borderTopColor: C.line,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 4,
    marginTop: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingVertical: 5,
  },
  thName: { width: "30%", paddingHorizontal: 4, fontFamily: "Helvetica-Bold" },
  thPurpose: {
    width: "28%",
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
  },
  thLoc: { width: "20%", paddingHorizontal: 4, fontFamily: "Helvetica-Bold" },
  thBasis: { width: "22%", paddingHorizontal: 4, fontFamily: "Helvetica-Bold" },
  tdName: { width: "30%", paddingHorizontal: 4, fontFamily: "Helvetica-Bold" },
  tdPurpose: { width: "28%", paddingHorizontal: 4, color: C.inkSoft },
  tdLoc: { width: "20%", paddingHorizontal: 4, color: C.inkSoft },
  tdBasis: { width: "22%", paddingHorizontal: 4, color: C.inkSoft },
  noteText: {
    color: C.inkSoft,
    marginTop: 6,
    fontSize: 9,
    textAlign: "justify",
  },
  signRow: { flexDirection: "row", gap: 14, marginTop: 8 },
  signBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: "#ffffff",
    padding: 10,
  },
  signLabel: {
    fontSize: 7.5,
    color: C.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  signLine: { marginTop: 3 },
  // maxHeight matters: a fixed view anchored by `bottom` without a bound gets
  // its height compounded page after page by the layout engine, and past ten
  // pages (the German text) the numbers exceed what pdfkit accepts. A fixed
  // `height` would cap it too, but then the text inside is never laid out.
  footer: {
    position: "absolute",
    bottom: 30,
    left: 46,
    right: 46,
    maxHeight: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 6,
    fontSize: 7.5,
    color: C.inkFaint,
  },
});

const Blocks = ({ blocks }: { blocks: DpaBlock[] }) => (
  <>
    {blocks.map((b, i) => {
      if (b.kind === "p")
        return (
          <Text key={i} style={s.p}>
            {b.text}
          </Text>
        );
      if (b.kind === "ul")
        return (
          <View key={i}>
            {b.items.map((it, j) => (
              <View key={j} style={s.li}>
                <Text style={s.bullet}>{"·"}</Text>
                <Text style={s.liText}>{it}</Text>
              </View>
            ))}
          </View>
        );
      return (
        <View key={i} style={{ marginTop: 4 }}>
          {b.items.map((it, j) => (
            <View key={j} style={s.defRow}>
              <Text style={s.defTerm}>{it.term}</Text>
              <Text style={s.defText}>{it.def}</Text>
            </View>
          ))}
        </View>
      );
    })}
  </>
);

const ClauseItems = ({ items }: { items: SccListItem[] }) => (
  <>
    {items.map((it, i) => (
      <View key={i} style={s.item}>
        <Text style={s.itemMarker}>{it.marker}</Text>
        <View style={s.itemBody}>
          {it.paragraphs.map((p, j) => (
            <Text key={j} style={j === 0 ? { textAlign: "justify" } : s.p}>
              {p}
            </Text>
          ))}
          {it.items && <ClauseItems items={it.items} />}
        </View>
      </View>
    ))}
  </>
);

const ClauseBlocks = ({ blocks }: { blocks: SccBlock[] }) => (
  <>
    {blocks.map((b, i) =>
      b.kind === "p" ? (
        <Text key={i} style={s.p}>
          {b.text}
        </Text>
      ) : (
        <ClauseItems key={i} items={b.items} />
      ),
    )}
  </>
);

const SignBox = ({ label, lines }: { label: string; lines: string[] }) => (
  <View style={s.signBox}>
    <Text style={s.signLabel}>{label}</Text>
    {lines.map((l, i) => (
      <Text key={i} style={s.signLine}>
        {l}
      </Text>
    ))}
  </View>
);

export const DpaDocument = ({
  lang,
  counterparty,
}: {
  lang: DpaLang;
  counterparty?: DpaCounterparty;
}) => {
  const doc = buildDpa(lang, counterparty);
  const footerLeft = `LicenseMeter ${lang === "de" ? "AVV" : "DPA"} v${doc.version} - Ugurlabs UG`;

  return (
    <Document title={`${doc.docTitle} - LicenseMeter`} author="LicenseMeter">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.hRow}>
          <View>
            <Text style={s.wordmark}>
              License<Text style={s.brandWord}>Meter</Text>
            </Text>
            <Text style={s.docTitle}>{doc.docTitle}</Text>
            <Text style={s.docSub}>{doc.docSubtitle}</Text>
          </View>
          <View>
            <Text style={s.meta}>Version {doc.version}</Text>
            <Text style={s.meta}>{doc.effective}</Text>
          </View>
        </View>

        {/* Our framing; not part of the Clauses */}
        <Text style={s.h2}>{doc.preamble.title}</Text>
        <Blocks blocks={doc.preamble.body} />

        {/* Clauses */}
        <Text style={s.h2}>{doc.clausesTitle}</Text>
        {doc.sections.map((sec) => (
          <View key={sec.id}>
            <Text style={s.sectionLabel}>
              {sec.label}
              {sec.title ? `: ${sec.title}` : ""}
            </Text>
            {doc.clauses
              .filter((c) => c.section === sec.id)
              .map((c) => (
                <View key={c.number}>
                  <Text style={s.clauseTitle} minPresenceAhead={30}>
                    {c.label}: {c.heading}
                  </Text>
                  <ClauseBlocks blocks={c.blocks} />
                  {c.parts.map((part) => (
                    <View key={part.number}>
                      <Text style={s.partTitle} minPresenceAhead={30}>
                        {part.number} {part.heading}
                      </Text>
                      <ClauseBlocks blocks={part.blocks} />
                    </View>
                  ))}
                </View>
              ))}
          </View>
        ))}

        {/* Annexes */}
        {doc.annexes.map((a) => (
          <View key={a.id}>
            <Text style={s.h2} minPresenceAhead={40}>
              {annexLabel(lang, a.id)}: {a.title}
            </Text>
            {a.intro && <Blocks blocks={a.intro} />}
            {a.parties?.map((p) => (
              <View key={p.heading} wrap={false}>
                <Text style={s.partyHeading}>{p.heading}</Text>
                <Blocks blocks={[{ kind: "defs", items: p.fields }]} />
              </View>
            ))}
            {a.body && <Blocks blocks={a.body} />}

            {a.toms?.map((g) => (
              <View key={g.title} style={s.tomGroup} wrap={false}>
                <Text style={s.tomTitle}>{g.title}</Text>
                {g.items.map((it, j) => (
                  <View key={j} style={s.li}>
                    <Text style={s.bullet}>{"·"}</Text>
                    <Text style={s.liText}>{it}</Text>
                  </View>
                ))}
              </View>
            ))}

            {a.subprocessors && (
              <>
                <View style={s.tableHead}>
                  <Text style={s.thName}>{a.subprocessors.headers.name}</Text>
                  <Text style={s.thPurpose}>
                    {a.subprocessors.headers.purpose}
                  </Text>
                  <Text style={s.thLoc}>
                    {a.subprocessors.headers.location}
                  </Text>
                  <Text style={s.thBasis}>{a.subprocessors.headers.basis}</Text>
                </View>
                {a.subprocessors.rows.map((r) => (
                  <View key={r.name} style={s.tableRow} wrap={false}>
                    <Text style={s.tdName}>{r.name}</Text>
                    <Text style={s.tdPurpose}>{r.purpose}</Text>
                    <Text style={s.tdLoc}>{r.location}</Text>
                    <Text style={s.tdBasis}>{r.basis}</Text>
                  </View>
                ))}
                {a.subprocessors.note.map((b, i) =>
                  b.kind === "p" ? (
                    <Text key={i} style={s.noteText}>
                      {b.text}
                    </Text>
                  ) : null,
                )}
              </>
            )}
          </View>
        ))}

        {/* Signatures */}
        <View wrap={false}>
          <Text style={s.h2}>{doc.signature.title}</Text>
          <Text style={s.p}>{doc.signature.intro}</Text>
          <View style={s.signRow}>
            <SignBox
              label={doc.signature.processor.label}
              lines={doc.signature.processor.lines}
            />
            <SignBox
              label={doc.signature.controller.label}
              lines={doc.signature.controller.lines}
            />
          </View>
        </View>

        {/* Fixed footer with page numbers */}
        <View style={s.footer} fixed>
          <Text>{footerLeft}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
};
