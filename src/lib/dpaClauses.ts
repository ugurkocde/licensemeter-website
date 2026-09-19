/**
 * Standard contractual clauses between controllers and processors under
 * Article 28(7) GDPR: the ANNEX of Commission Implementing Decision (EU)
 * 2021/915 of 4 June 2021 (OJ L 199, 7.6.2021, p. 18), in English and German.
 *
 * Source (official EUR-Lex HTML rendition of the Official Journal text):
 *   EN https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32021D0915
 *   DE https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:32021D0915
 *   ELI http://data.europa.eu/eli/dec_impl/2021/915/oj
 * Retrieved: 2026-09-19. The data below was extracted from those pages by a
 * script, not retyped, so the wording is the published wording.
 *
 * DO NOT EDIT THE TEXT. Clause 2 forbids the parties from modifying the
 * Clauses. Nothing here is paraphrased, corrected or translated, including
 * what reads like a slip in the publication (the German title is published as
 * "Standardverstragsklauseln"). Only whitespace is normalised: non-breaking
 * spaces became plain spaces, and "Clause7" in the English HTML rendition is
 * stored as "Clause 7". Punctuation is kept as published, including the dash in
 * the heading of Clause 5 and in Clause 7.7(e), because it is part of the
 * official text.
 *
 * The Clauses leave a few options to the parties. The published text keeps
 * every option; what LicenseMeter chose is recorded separately in DPA_CHOICES
 * and applied by resolvedClauses(), which only removes the option that was not
 * chosen and fills in the notice period. Annexes I to IV are ours and live in
 * ~/lib/dpa; `annexes` here holds the published annex templates, so the annex
 * headings we render can be checked against the official ones.
 */

export type SccLang = "en" | "de";

export type SccSectionId = "I" | "II" | "III";

/** One lettered or numbered point, as published, with its marker. */
export type SccListItem = {
  marker: string;
  paragraphs: string[];
  items?: SccListItem[];
};

export type SccBlock =
  { kind: "p"; text: string } | { kind: "list"; items: SccListItem[] };

/** A numbered part of a clause, such as 7.1. or 9.2. */
export type SccPart = { number: string; heading: string; blocks: SccBlock[] };

export type SccClause = {
  section: SccSectionId;
  number: number;
  /** The published label, for example "Clause 5 - Optional". */
  label: string;
  heading: string;
  blocks: SccBlock[];
  parts: SccPart[];
};

export type SccSection = {
  id: SccSectionId;
  label: string;
  title: string | null;
};

/** A published annex template: the form the parties fill in. */
export type SccAnnexTemplate = {
  id: "I" | "II" | "III" | "IV";
  label: string;
  title: string;
  paragraphs: string[];
};

export type SccText = {
  title: string;
  sections: SccSection[];
  clauses: SccClause[];
  annexes: SccAnnexTemplate[];
};

/* ------------------------------------------------------------------ English */

const EN: SccText = {
  title: "Standard contractual clauses",
  sections: [
    {
      id: "I",
      label: "SECTION I",
      title: null,
    },
    {
      id: "II",
      label: "SECTION II",
      title: "OBLIGATIONS OF THE PARTIES",
    },
    {
      id: "III",
      label: "SECTION III",
      title: "FINAL PROVISIONS",
    },
  ],
  clauses: [
    {
      section: "I",
      number: 1,
      label: "Clause 1",
      heading: "Purpose and scope",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "(a)",
              paragraphs: [
                "The purpose of these Standard Contractual Clauses (the Clauses) is to ensure compliance with [choose relevant option: OPTION 1: Article 28(3) and (4) of Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 on the protection of natural persons with regard to the processing of personal data and on the free movement of such data, and repealing Directive 95/46/EC (General Data Protection Regulation)] / [OPTION 2: Article 29(3) and (4) of Regulation (EU) 2018/1725 of the European Parliament and of the Council of 23 October 2018 on the protection of natural persons with regard to the processing of personal data by the Union institutions, bodies, offices and agencies and on the free movement of such data, and repealing Regulation (EC) No 45/2001 and Decision No 1247/2002/EC].",
              ],
            },
            {
              marker: "(b)",
              paragraphs: [
                "The controllers and processors listed in Annex I have agreed to these Clauses in order to ensure compliance with Article 28(3) and (4) of Regulation (EU) 2016/679 and/or Article 29(3) and (4) of Regulation (EU) 2018/1725.",
              ],
            },
            {
              marker: "(c)",
              paragraphs: [
                "These Clauses apply to the processing of personal data as specified in Annex II.",
              ],
            },
            {
              marker: "(d)",
              paragraphs: [
                "Annexes I to IV are an integral part of the Clauses.",
              ],
            },
            {
              marker: "(e)",
              paragraphs: [
                "These Clauses are without prejudice to obligations to which the controller is subject by virtue of Regulation (EU) 2016/679 and/or Regulation (EU) 2018/1725.",
              ],
            },
            {
              marker: "(f)",
              paragraphs: [
                "These Clauses do not by themselves ensure compliance with obligations related to international transfers in accordance with Chapter V of Regulation (EU) 2016/679 and/or Regulation (EU) 2018/1725.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
    {
      section: "I",
      number: 2,
      label: "Clause 2",
      heading: "Invariability of the Clauses",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "(a)",
              paragraphs: [
                "The Parties undertake not to modify the Clauses, except for adding information to the Annexes or updating information in them.",
              ],
            },
            {
              marker: "(b)",
              paragraphs: [
                "This does not prevent the Parties from including the standard contractual clauses laid down in these Clauses in a broader contract, or from adding other clauses or additional safeguards provided that they do not directly or indirectly contradict the Clauses or detract from the fundamental rights or freedoms of data subjects.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
    {
      section: "I",
      number: 3,
      label: "Clause 3",
      heading: "Interpretation",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "(a)",
              paragraphs: [
                "Where these Clauses use the terms defined in Regulation (EU) 2016/679 or Regulation (EU) 2018/1725 respectively, those terms shall have the same meaning as in that Regulation.",
              ],
            },
            {
              marker: "(b)",
              paragraphs: [
                "These Clauses shall be read and interpreted in the light of the provisions of Regulation (EU) 2016/679 or Regulation (EU) 2018/1725 respectively.",
              ],
            },
            {
              marker: "(c)",
              paragraphs: [
                "These Clauses shall not be interpreted in a way that runs counter to the rights and obligations provided for in Regulation (EU) 2016/679 / Regulation (EU) 2018/1725 or in a way that prejudices the fundamental rights or freedoms of the data subjects.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
    {
      section: "I",
      number: 4,
      label: "Clause 4",
      heading: "Hierarchy",
      blocks: [
        {
          kind: "p",
          text: "In the event of a contradiction between these Clauses and the provisions of related agreements between the Parties existing at the time when these Clauses are agreed or entered into thereafter, these Clauses shall prevail.",
        },
      ],
      parts: [],
    },
    {
      section: "I",
      number: 5,
      label: "Clause 5 - Optional",
      heading: "Docking clause",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "(a)",
              paragraphs: [
                "Any entity that is not a Party to these Clauses may, with the agreement of all the Parties, accede to these Clauses at any time as a controller or a processor by completing the Annexes and signing Annex I.",
              ],
            },
            {
              marker: "(b)",
              paragraphs: [
                "Once the Annexes in (a) are completed and signed, the acceding entity shall be treated as a Party to these Clauses and have the rights and obligations of a controller or a processor, in accordance with its designation in Annex I.",
              ],
            },
            {
              marker: "(c)",
              paragraphs: [
                "The acceding entity shall have no rights or obligations resulting from these Clauses from the period prior to becoming a Party.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
    {
      section: "II",
      number: 6,
      label: "Clause 6",
      heading: "Description of processing(s)",
      blocks: [
        {
          kind: "p",
          text: "The details of the processing operations, in particular the categories of personal data and the purposes of processing for which the personal data is processed on behalf of the controller, are specified in Annex II.",
        },
      ],
      parts: [],
    },
    {
      section: "II",
      number: 7,
      label: "Clause 7",
      heading: "Obligations of the Parties",
      blocks: [],
      parts: [
        {
          number: "7.1.",
          heading: "Instructions",
          blocks: [
            {
              kind: "list",
              items: [
                {
                  marker: "(a)",
                  paragraphs: [
                    "The processor shall process personal data only on documented instructions from the controller, unless required to do so by Union or Member State law to which the processor is subject. In this case, the processor shall inform the controller of that legal requirement before processing, unless the law prohibits this on important grounds of public interest. Subsequent instructions may also be given by the controller throughout the duration of the processing of personal data. These instructions shall always be documented.",
                  ],
                },
                {
                  marker: "(b)",
                  paragraphs: [
                    "The processor shall immediately inform the controller if, in the processor’s opinion, instructions given by the controller infringe Regulation (EU) 2016/679 / Regulation (EU) 2018/1725 or the applicable Union or Member State data protection provisions.",
                  ],
                },
              ],
            },
          ],
        },
        {
          number: "7.2.",
          heading: "Purpose limitation",
          blocks: [
            {
              kind: "p",
              text: "The processor shall process the personal data only for the specific purpose(s) of the processing, as set out in Annex II, unless it receives further instructions from the controller.",
            },
          ],
        },
        {
          number: "7.3.",
          heading: "Duration of the processing of personal data",
          blocks: [
            {
              kind: "p",
              text: "Processing by the processor shall only take place for the duration specified in Annex II.",
            },
          ],
        },
        {
          number: "7.4.",
          heading: "Security of processing",
          blocks: [
            {
              kind: "list",
              items: [
                {
                  marker: "(a)",
                  paragraphs: [
                    "The processor shall at least implement the technical and organisational measures specified in Annex III to ensure the security of the personal data. This includes protecting the data against a breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorised disclosure or access to the data (personal data breach). In assessing the appropriate level of security, the Parties shall take due account of the state of the art, the costs of implementation, the nature, scope, context and purposes of processing and the risks involved for the data subjects.",
                  ],
                },
                {
                  marker: "(b)",
                  paragraphs: [
                    "The processor shall grant access to the personal data undergoing processing to members of its personnel only to the extent strictly necessary for implementing, managing and monitoring of the contract. The processor shall ensure that persons authorised to process the personal data received have committed themselves to confidentiality or are under an appropriate statutory obligation of confidentiality.",
                  ],
                },
              ],
            },
          ],
        },
        {
          number: "7.5.",
          heading: "Sensitive data",
          blocks: [
            {
              kind: "p",
              text: "If the processing involves personal data revealing racial or ethnic origin, political opinions, religious or philosophical beliefs, or trade union membership, genetic data or biometric data for the purpose of uniquely identifying a natural person, data concerning health or a person’s sex life or sexual orientation, or data relating to criminal convictions and offences (“sensitive data”), the processor shall apply specific restrictions and/or additional safeguards.",
            },
          ],
        },
        {
          number: "7.6.",
          heading: "Documentation and compliance",
          blocks: [
            {
              kind: "list",
              items: [
                {
                  marker: "(a)",
                  paragraphs: [
                    "The Parties shall be able to demonstrate compliance with these Clauses.",
                  ],
                },
                {
                  marker: "(b)",
                  paragraphs: [
                    "The processor shall deal promptly and adequately with inquiries from the controller about the processing of data in accordance with these Clauses.",
                  ],
                },
                {
                  marker: "(c)",
                  paragraphs: [
                    "The processor shall make available to the controller all information necessary to demonstrate compliance with the obligations that are set out in these Clauses and stem directly from Regulation (EU) 2016/679 and/or Regulation (EU) 2018/1725. At the controller’s request, the processor shall also permit and contribute to audits of the processing activities covered by these Clauses, at reasonable intervals or if there are indications of non-compliance. In deciding on a review or an audit, the controller may take into account relevant certifications held by the processor.",
                  ],
                },
                {
                  marker: "(d)",
                  paragraphs: [
                    "The controller may choose to conduct the audit by itself or mandate an independent auditor. Audits may also include inspections at the premises or physical facilities of the processor and shall, where appropriate, be carried out with reasonable notice.",
                  ],
                },
                {
                  marker: "(e)",
                  paragraphs: [
                    "The Parties shall make the information referred to in this Clause, including the results of any audits, available to the competent supervisory authority/ies on request.",
                  ],
                },
              ],
            },
          ],
        },
        {
          number: "7.7.",
          heading: "Use of sub-processors",
          blocks: [
            {
              kind: "list",
              items: [
                {
                  marker: "(a)",
                  paragraphs: [
                    "OPTION 1: PRIOR SPECIFIC AUTHORISATION: The processor shall not subcontract any of its processing operations performed on behalf of the controller in accordance with these Clauses to a sub-processor, without the controller’s prior specific written authorisation. The processor shall submit the request for specific authorisation at least [SPECIFY TIME PERIOD] prior to the engagement of the sub-processor in question, together with the information necessary to enable the controller to decide on the authorisation. The list of sub-processors authorised by the controller can be found in Annex IV. The Parties shall keep Annex IV up to date.",
                    "OPTION 2: GENERAL WRITTEN AUTHORISATION: The processor has the controller’s general authorisation for the engagement of sub-processors from an agreed list. The processor shall specifically inform in writing the controller of any intended changes of that list through the addition or replacement of sub-processors at least [SPECIFY TIME PERIOD] in advance, thereby giving the controller sufficient time to be able to object to such changes prior to the engagement of the concerned sub-processor(s). The processor shall provide the controller with the information necessary to enable the controller to exercise the right to object.",
                  ],
                },
                {
                  marker: "(b)",
                  paragraphs: [
                    "Where the processor engages a sub-processor for carrying out specific processing activities (on behalf of the controller), it shall do so by way of a contract which imposes on the sub-processor, in substance, the same data protection obligations as the ones imposed on the data processor in accordance with these Clauses. The processor shall ensure that the sub-processor complies with the obligations to which the processor is subject pursuant to these Clauses and to Regulation (EU) 2016/679 and/or Regulation (EU) 2018/1725.",
                  ],
                },
                {
                  marker: "(c)",
                  paragraphs: [
                    "At the controller’s request, the processor shall provide a copy of such a sub-processor agreement and any subsequent amendments to the controller. To the extent necessary to protect business secret or other confidential information, including personal data, the processor may redact the text of the agreement prior to sharing the copy.",
                  ],
                },
                {
                  marker: "(d)",
                  paragraphs: [
                    "The processor shall remain fully responsible to the controller for the performance of the sub-processor’s obligations in accordance with its contract with the processor. The processor shall notify the controller of any failure by the sub-processor to fulfil its contractual obligations.",
                  ],
                },
                {
                  marker: "(e)",
                  paragraphs: [
                    "The processor shall agree a third party beneficiary clause with the sub-processor whereby - in the event the processor has factually disappeared, ceased to exist in law or has become insolvent - the controller shall have the right to terminate the sub-processor contract and to instruct the sub-processor to erase or return the personal data.",
                  ],
                },
              ],
            },
          ],
        },
        {
          number: "7.8.",
          heading: "International transfers",
          blocks: [
            {
              kind: "list",
              items: [
                {
                  marker: "(a)",
                  paragraphs: [
                    "Any transfer of data to a third country or an international organisation by the processor shall be done only on the basis of documented instructions from the controller or in order to fulfil a specific requirement under Union or Member State law to which the processor is subject and shall take place in compliance with Chapter V of Regulation (EU) 2016/679 or Regulation (EU) 2018/1725.",
                  ],
                },
                {
                  marker: "(b)",
                  paragraphs: [
                    "The controller agrees that where the processor engages a sub-processor in accordance with Clause 7.7. for carrying out specific processing activities (on behalf of the controller) and those processing activities involve a transfer of personal data within the meaning of Chapter V of Regulation (EU) 2016/679, the processor and the sub-processor can ensure compliance with Chapter V of Regulation (EU) 2016/679 by using standard contractual clauses adopted by the Commission in accordance with of Article 46(2) of Regulation (EU) 2016/679, provided the conditions for the use of those standard contractual clauses are met.",
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      section: "II",
      number: 8,
      label: "Clause 8",
      heading: "Assistance to the controller",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "(a)",
              paragraphs: [
                "The processor shall promptly notify the controller of any request it has received from the data subject. It shall not respond to the request itself, unless authorised to do so by the controller.",
              ],
            },
            {
              marker: "(b)",
              paragraphs: [
                "The processor shall assist the controller in fulfilling its obligations to respond to data subjects’ requests to exercise their rights, taking into account the nature of the processing. In fulfilling its obligations in accordance with (a) and (b), the processor shall comply with the controller’s instructions",
              ],
            },
            {
              marker: "(c)",
              paragraphs: [
                "In addition to the processor’s obligation to assist the controller pursuant to Clause 8(b), the processor shall furthermore assist the controller in ensuring compliance with the following obligations, taking into account the nature of the data processing and the information available to the processor:",
              ],
              items: [
                {
                  marker: "(1)",
                  paragraphs: [
                    "the obligation to carry out an assessment of the impact of the envisaged processing operations on the protection of personal data (a ‘data protection impact assessment’) where a type of processing is likely to result in a high risk to the rights and freedoms of natural persons;",
                  ],
                },
                {
                  marker: "(2)",
                  paragraphs: [
                    "the obligation to consult the competent supervisory authority/ies prior to processing where a data protection impact assessment indicates that the processing would result in a high risk in the absence of measures taken by the controller to mitigate the risk;",
                  ],
                },
                {
                  marker: "(3)",
                  paragraphs: [
                    "the obligation to ensure that personal data is accurate and up to date, by informing the controller without delay if the processor becomes aware that the personal data it is processing is inaccurate or has become outdated;",
                  ],
                },
                {
                  marker: "(4)",
                  paragraphs: [
                    "the obligations in [OPTION 1] Article 32 of Regulation (EU) 2016/679/ [OPTION 2] Articles 33 and 36 to 38 of Regulation (EU) 2018/1725.",
                  ],
                },
              ],
            },
            {
              marker: "(d)",
              paragraphs: [
                "The Parties shall set out in Annex III the appropriate technical and organisational measures by which the processor is required to assist the controller in the application of this Clause as well as the scope and the extent of the assistance required.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
    {
      section: "II",
      number: 9,
      label: "Clause 9",
      heading: "Notification of personal data breach",
      blocks: [
        {
          kind: "p",
          text: "In the event of a personal data breach, the processor shall cooperate with and assist the controller for the controller to comply with its obligations under Articles 33 and 34 of Regulation (EU) 2016/679 or under Articles 34 and 35 of Regulation (EU) 2018/1725, where applicable, taking into account the nature of processing and the information available to the processor.",
        },
      ],
      parts: [
        {
          number: "9.1",
          heading: "Data breach concerning data processed by the controller",
          blocks: [
            {
              kind: "p",
              text: "In the event of a personal data breach concerning data processed by the controller, the processor shall assist the controller:",
            },
            {
              kind: "list",
              items: [
                {
                  marker: "(a)",
                  paragraphs: [
                    "in notifying the personal data breach to the competent supervisory authority/ies, without undue delay after the controller has become aware of it, where relevant/(unless the personal data breach is unlikely to result in a risk to the rights and freedoms of natural persons);",
                  ],
                },
                {
                  marker: "(b)",
                  paragraphs: [
                    "in obtaining the following information which, pursuant to [OPTION 1] Article 33(3) of Regulation (EU) 2016/679/ [OPTION 2] Article 34(3) of Regulation (EU) 2018/1725, shall be stated in the controller’s notification, and must at least include:",
                  ],
                  items: [
                    {
                      marker: "(1)",
                      paragraphs: [
                        "the nature of the personal data including where possible, the categories and approximate number of data subjects concerned and the categories and approximate number of personal data records concerned;",
                      ],
                    },
                    {
                      marker: "(2)",
                      paragraphs: [
                        "the likely consequences of the personal data breach;",
                      ],
                    },
                    {
                      marker: "(3)",
                      paragraphs: [
                        "the measures taken or proposed to be taken by the controller to address the personal data breach, including, where appropriate, measures to mitigate its possible adverse effects.",
                      ],
                    },
                  ],
                },
              ],
            },
            {
              kind: "p",
              text: "Where, and insofar as, it is not possible to provide all this information at the same time, the initial notification shall contain the information then available and further information shall, as it becomes available, subsequently be provided without undue delay.",
            },
            {
              kind: "list",
              items: [
                {
                  marker: "(c)",
                  paragraphs: [
                    "in complying, pursuant to [OPTION 1] Article 34 of Regulation (EU) 2016/679 / [OPTION 2] Article 35 of Regulation (EU) 2018/1725, with the obligation to communicate without undue delay the personal data breach to the data subject, when the personal data breach is likely to result in a high risk to the rights and freedoms of natural persons.",
                  ],
                },
              ],
            },
          ],
        },
        {
          number: "9.2",
          heading: "Data breach concerning data processed by the processor",
          blocks: [
            {
              kind: "p",
              text: "In the event of a personal data breach concerning data processed by the processor, the processor shall notify the controller without undue delay after the processor having become aware of the breach. Such notification shall contain, at least:",
            },
            {
              kind: "list",
              items: [
                {
                  marker: "(a)",
                  paragraphs: [
                    "a description of the nature of the breach (including, where possible, the categories and approximate number of data subjects and data records concerned);",
                  ],
                },
                {
                  marker: "(b)",
                  paragraphs: [
                    "the details of a contact point where more information concerning the personal data breach can be obtained;",
                  ],
                },
                {
                  marker: "(c)",
                  paragraphs: [
                    "its likely consequences and the measures taken or proposed to be taken to address the breach, including to mitigate its possible adverse effects.",
                  ],
                },
              ],
            },
            {
              kind: "p",
              text: "Where, and insofar as, it is not possible to provide all this information at the same time, the initial notification shall contain the information then available and further information shall, as it becomes available, subsequently be provided without undue delay.",
            },
            {
              kind: "p",
              text: "The Parties shall set out in Annex III all other elements to be provided by the processor when assisting the controller in the compliance with the controller’s obligations under [OPTION 1] Articles 33 and 34 of Regulation (EU) 2016/679 / [OPTION 2] Articles 34 and 35 of Regulation (EU) 2018/1725.",
            },
          ],
        },
      ],
    },
    {
      section: "III",
      number: 10,
      label: "Clause 10",
      heading: "Non-compliance with the Clauses and termination",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "(a)",
              paragraphs: [
                "Without prejudice to any provisions of Regulation (EU) 2016/679 and/or Regulation (EU) 2018/1725, in the event that the processor is in breach of its obligations under these Clauses, the controller may instruct the processor to suspend the processing of personal data until the latter complies with these Clauses or the contract is terminated. The processor shall promptly inform the controller in case it is unable to comply with these Clauses, for whatever reason.",
              ],
            },
            {
              marker: "(b)",
              paragraphs: [
                "The controller shall be entitled to terminate the contract insofar as it concerns processing of personal data in accordance with these Clauses if:",
              ],
              items: [
                {
                  marker: "(1)",
                  paragraphs: [
                    "the processing of personal data by the processor has been suspended by the controller pursuant to point (a) and if compliance with these Clauses is not restored within a reasonable time and in any event within one month following suspension;",
                  ],
                },
                {
                  marker: "(2)",
                  paragraphs: [
                    "the processor is in substantial or persistent breach of these Clauses or its obligations under Regulation (EU) 2016/679 and/or Regulation (EU) 2018/1725;",
                  ],
                },
                {
                  marker: "(3)",
                  paragraphs: [
                    "the processor fails to comply with a binding decision of a competent court or the competent supervisory authority/ies regarding its obligations pursuant to these Clauses or to Regulation (EU) 2016/679 and/or Regulation (EU) 2018/1725.",
                  ],
                },
              ],
            },
            {
              marker: "(c)",
              paragraphs: [
                "The processor shall be entitled to terminate the contract insofar as it concerns processing of personal data under these Clauses where, after having informed the controller that its instructions infringe applicable legal requirements in accordance with Clause 7.1 (b), the controller insists on compliance with the instructions.",
              ],
            },
            {
              marker: "(d)",
              paragraphs: [
                "Following termination of the contract, the processor shall, at the choice of the controller, delete all personal data processed on behalf of the controller and certify to the controller that it has done so, or, return all the personal data to the controller and delete existing copies unless Union or Member State law requires storage of the personal data. Until the data is deleted or returned, the processor shall continue to ensure compliance with these Clauses.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
  ],
  annexes: [
    {
      id: "I",
      label: "ANNEX I",
      title: "List of parties",
      paragraphs: [
        "Controller(s): [Identity and contact details of the controller(s), and, where applicable, of the controller’s data protection officer]",
        "1.",
        "Name: …",
        "Address: …",
        "Contact person’s name, position and contact details: …",
        "Signature and accession date: …",
        "2.",
        "…",
        "Processor(s): [Identity and contact details of the processor(s) and, where applicable, of the processor’s data protection officer]",
        "1.",
        "Name: …",
        "Address: …",
        "Contact person’s name, position and contact details: …",
        "Signature and accession date: …",
        "2.",
        "…",
      ],
    },
    {
      id: "II",
      label: "ANNEX II",
      title: "Description of the processing",
      paragraphs: [
        "Categories of data subjects whose personal data is processed",
        "…",
        "Categories of personal data processed",
        "….",
        "Sensitive data processed (if applicable) and applied restrictions or safeguards that fully take into consideration the nature of the data and the risks involved, such as for instance strict purpose limitation, access restrictions (including access only for staff having followed specialised training), keeping a record of access to the data, restrictions for onward transfers or additional security measures.",
        "…",
        "Nature of the processing",
        "….",
        "Purpose(s) for which the personal data is processed on behalf of the controller",
        "…",
        "Duration of the processing",
        "…",
        "…",
        "For processing by (sub-) processors, also specify subject matter, nature and duration of the processing",
      ],
    },
    {
      id: "III",
      label: "ANNEX III",
      title:
        "Technical and organisational measures including technical and organisational measures to ensure the security of the data",
      paragraphs: [
        "EXPLANATORY NOTE:",
        "The technical and organisational measures need to be described concretely and not in a generic manner.",
        "Description of the technical and organisational security measures implemented by the processor(s) (including any relevant certifications) to ensure an appropriate level of security, taking into account the nature, scope, context and purpose of the processing, as well as the risks for the rights and freedoms of natural persons. Examples of possible measures:",
        "Measures of pseudonymisation and encryption of personal data",
        "Measures for ensuring ongoing confidentiality, integrity, availability and resilience of processing systems and services",
        "Measures for ensuring the ability to restore the availability and access to personal data in a timely manner in the event of a physical or technical incident",
        "Processes for regularly testing, assessing and evaluating the effectiveness of technical and organisational measures in order to ensure the security of the processing",
        "Measures for user identification and authorisation",
        "Measures for the protection of data during transmission",
        "Measures for the protection of data during storage",
        "Measures for ensuring physical security of locations at which personal data are processed",
        "Measures for ensuring events logging",
        "Measures for ensuring system configuration, including default configuration",
        "Measures for internal IT and IT security governance and management",
        "Measures for certification/assurance of processes and products",
        "Measures for ensuring data minimisation",
        "Measures for ensuring data quality",
        "Measures for ensuring limited data retention",
        "Measures for ensuring accountability",
        "Measures for allowing data portability and ensuring erasure]",
        "For transfers to (sub-) processors, also describe the specific technical and organisational measures to be taken by the (sub-) processor to be able to provide assistance to the controller",
        "Description of the specific technical and organisational measures to be taken by the processor to be able to provide assistance to the controller.",
      ],
    },
    {
      id: "IV",
      label: "ANNEX IV",
      title: "List of sub-processors",
      paragraphs: [
        "EXPLANATORY NOTE:",
        "This Annex needs to be completed in case of specific authorisation of sub-processors (Clause 7.7(a), Option 1).",
        "The controller has authorised the use of the following sub-processors:",
        "1.",
        "Name: …",
        "Address: …",
        "Contact person’s name, position and contact details: …",
        "Description of the processing (including a clear delimitation of responsibilities in case several sub-processors are authorised): …",
        "2.",
        "…",
      ],
    },
  ],
};

/* ------------------------------------------------------------------- German */

const DE: SccText = {
  title: "Standardverstragsklauseln",
  sections: [
    {
      id: "I",
      label: "ABSCHNITT I",
      title: null,
    },
    {
      id: "II",
      label: "ABSCHNITT II",
      title: "PFLICHTEN DER PARTEIEN",
    },
    {
      id: "III",
      label: "ABSCHNITT III",
      title: "SCHLUSSBESTIMMUNGEN",
    },
  ],
  clauses: [
    {
      section: "I",
      number: 1,
      label: "Klausel 1",
      heading: "Zweck und Anwendungsbereich",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "a)",
              paragraphs: [
                "Mit diesen Standardvertragsklauseln (im Folgenden „Klauseln“) soll die Einhaltung von [zutreffende Option auswählen: OPTION 1: Artikel 28 Absätze 3 und 4 der Verordnung (EU) 2016/679 des Europäischen Parlaments und des Rates vom 27. April 2016 zum Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten, zum freien Datenverkehr und zur Aufhebung der Richtlinie 95/46/EG (Datenschutz-Grundverordnung)] oder [OPTION 2: Artikel 29 Absätze 3 und 4 der Verordnung (EU) 2018/1725 des Europäischen Parlaments und des Rates vom 23. Oktober 2018 zum Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten durch die Organe, Einrichtungen und sonstigen Stellen der Union, zum freien Datenverkehr und zur Aufhebung der Verordnung (EG) Nr. 45/2001 und des Beschlusses Nr. 1247/2002/EG] sichergestellt werden.",
              ],
            },
            {
              marker: "b)",
              paragraphs: [
                "Die in Anhang I aufgeführten Verantwortlichen und Auftragsverarbeiter haben diesen Klauseln zugestimmt, um die Einhaltung von Artikel 28 Absätze 3 und 4 der Verordnung (EU) 2016/679 und/oder Artikel 29 Absätze 3 und 4 der Verordnung (EU) 2018/1725 zu gewährleisten.",
              ],
            },
            {
              marker: "c)",
              paragraphs: [
                "Diese Klauseln gelten für die Verarbeitung personenbezogener Daten gemäß Anhang II.",
              ],
            },
            {
              marker: "d)",
              paragraphs: [
                "Die Anhänge I bis IV sind Bestandteil der Klauseln.",
              ],
            },
            {
              marker: "e)",
              paragraphs: [
                "Diese Klauseln gelten unbeschadet der Verpflichtungen, denen der Verantwortliche gemäß der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 unterliegt.",
              ],
            },
            {
              marker: "f)",
              paragraphs: [
                "Diese Klauseln stellen für sich allein genommen nicht sicher, dass die Verpflichtungen im Zusammenhang mit internationalen Datenübermittlungen gemäß Kapitel V der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 erfüllt werden.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
    {
      section: "I",
      number: 2,
      label: "Klausel 2",
      heading: "Unabänderbarkeit der Klauseln",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "a)",
              paragraphs: [
                "Die Parteien verpflichten sich, die Klauseln nicht zu ändern, es sei denn, zur Ergänzung oder Aktualisierung der in den Anhängen angegebenen Informationen.",
              ],
            },
            {
              marker: "b)",
              paragraphs: [
                "Dies hindert die Parteien nicht daran die in diesen Klauseln festgelegten Standardvertragsklauseln in einen umfangreicheren Vertrag aufzunehmen und weitere Klauseln oder zusätzliche Garantien hinzuzufügen, sofern diese weder unmittelbar noch mittelbar im Widerspruch zu den Klauseln stehen oder die Grundrechte oder Grundfreiheiten der betroffenen Personen beschneiden.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
    {
      section: "I",
      number: 3,
      label: "Klausel 3",
      heading: "Auslegung",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "a)",
              paragraphs: [
                "Werden in diesen Klauseln die in der Verordnung (EU) 2016/679 bzw. der Verordnung (EU) 2018/1725 definierten Begriffe verwendet, so haben diese Begriffe dieselbe Bedeutung wie in der betreffenden Verordnung.",
              ],
            },
            {
              marker: "b)",
              paragraphs: [
                "Diese Klauseln sind im Lichte der Bestimmungen der Verordnung (EU) 2016/679 bzw. der Verordnung (EU) 2018/1725 auszulegen.",
              ],
            },
            {
              marker: "c)",
              paragraphs: [
                "Diese Klauseln dürfen nicht in einer Weise ausgelegt werden, die den in der Verordnung (EU) 2016/679 oder der Verordnung (EU) 2018/1725 vorgesehenen Rechten und Pflichten zuwiderläuft oder die Grundrechte oder Grundfreiheiten der betroffenen Personen beschneidet.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
    {
      section: "I",
      number: 4,
      label: "Klausel 4",
      heading: "Vorrang",
      blocks: [
        {
          kind: "p",
          text: "Im Falle eines Widerspruchs zwischen diesen Klauseln und den Bestimmungen damit zusammenhängender Vereinbarungen, die zwischen den Parteien bestehen oder später eingegangen oder geschlossen werden, haben diese Klauseln Vorrang.",
        },
      ],
      parts: [],
    },
    {
      section: "I",
      number: 5,
      label: "Klausel 5 \u2013 fakultativ",
      heading: "Kopplungsklausel",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "a)",
              paragraphs: [
                "Eine Einrichtung, die nicht Partei dieser Klauseln ist, kann diesen Klauseln mit Zustimmung aller Parteien jederzeit als Verantwortlicher oder als Auftragsverarbeiter beitreten, indem sie die Anhänge ausfüllt und Anhang I unterzeichnet.",
              ],
            },
            {
              marker: "b)",
              paragraphs: [
                "Nach Ausfüllen und Unterzeichnen der unter Buchstabe a genannten Anhänge wird die beitretende Einrichtung als Partei dieser Klauseln behandelt und hat die Rechte und Pflichten eines Verantwortlichen oder eines Auftragsverarbeiters entsprechend ihrer Bezeichnung in Anhang I.",
              ],
            },
            {
              marker: "c)",
              paragraphs: [
                "Für die beitretende Einrichtung gelten für den Zeitraum vor ihrem Beitritt als Partei keine aus diesen Klauseln resultierenden Rechte oder Pflichten.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
    {
      section: "II",
      number: 6,
      label: "Klausel 6",
      heading: "Beschreibung der Verarbeitung",
      blocks: [
        {
          kind: "p",
          text: "Die Einzelheiten der Verarbeitungsvorgänge, insbesondere die Kategorien personenbezogener Daten und die Zwecke, für die die personenbezogenen Daten im Auftrag des Verantwortlichen verarbeitet werden, sind in Anhang II aufgeführt.",
        },
      ],
      parts: [],
    },
    {
      section: "II",
      number: 7,
      label: "Klausel 7",
      heading: "Pflichten der Parteien",
      blocks: [],
      parts: [
        {
          number: "7.1.",
          heading: "Weisungen",
          blocks: [
            {
              kind: "list",
              items: [
                {
                  marker: "a)",
                  paragraphs: [
                    "Der Auftragsverarbeiter verarbeitet personenbezogene Daten nur auf dokumentierte Weisung des Verantwortlichen, es sei denn, er ist nach Unionsrecht oder nach dem Recht eines Mitgliedstaats, dem er unterliegt, zur Verarbeitung verpflichtet. In einem solchen Fall teilt der Auftragsverarbeiter dem Verantwortlichen diese rechtlichen Anforderungen vor der Verarbeitung mit, sofern das betreffende Recht dies nicht wegen eines wichtigen öffentlichen Interesses verbietet. Der Verantwortliche kann während der gesamten Dauer der Verarbeitung personenbezogener Daten weitere Weisungen erteilen. Diese Weisungen sind stets zu dokumentieren.",
                  ],
                },
                {
                  marker: "b)",
                  paragraphs: [
                    "Der Auftragsverarbeiter informiert den Verantwortlichen unverzüglich, wenn er der Auffassung ist, dass vom Verantwortlichen erteilte Weisungen gegen die Verordnung (EU) 2016/679, die Verordnung (EU) 2018/1725 oder geltende Datenschutzbestimmungen der Union oder der Mitgliedstaaten verstoßen.",
                  ],
                },
              ],
            },
          ],
        },
        {
          number: "7.2.",
          heading: "Zweckbindung",
          blocks: [
            {
              kind: "p",
              text: "Der Auftragsverarbeiter verarbeitet die personenbezogenen Daten nur für den/die in Anhang II genannten spezifischen Zweck(e), sofern er keine weiteren Weisungen des Verantwortlichen erhält.",
            },
          ],
        },
        {
          number: "7.3.",
          heading: "Dauer der Verarbeitung personenbezogener Daten",
          blocks: [
            {
              kind: "p",
              text: "Die Daten werden vom Auftragsverarbeiter nur für die in Anhang II angegebene Dauer verarbeitet.",
            },
          ],
        },
        {
          number: "7.4.",
          heading: "Sicherheit der Verarbeitung",
          blocks: [
            {
              kind: "list",
              items: [
                {
                  marker: "a)",
                  paragraphs: [
                    "Der Auftragsverarbeiter ergreift mindestens die in Anhang III aufgeführten technischen und organisatorischen Maßnahmen, um die Sicherheit der personenbezogenen Daten zu gewährleisten. Dies umfasst den Schutz der Daten vor einer Verletzung der Sicherheit, die, ob unbeabsichtigt oder unrechtmäßig, zur Vernichtung, zum Verlust, zur Veränderung oder zur unbefugten Offenlegung von beziehungsweise zum unbefugten Zugang zu den Daten führt (im Folgenden „Verletzung des Schutzes personenbezogener Daten“). Bei der Beurteilung des angemessenen Schutzniveaus tragen die Parteien dem Stand der Technik, den Implementierungskosten, der Art, dem Umfang, den Umständen und den Zwecken der Verarbeitung sowie den für die betroffenen Personen verbundenen Risiken gebührend Rechnung.",
                  ],
                },
                {
                  marker: "b)",
                  paragraphs: [
                    "Der Auftragsverarbeiter gewährt seinem Personal nur insoweit Zugang zu den personenbezogenen Daten, die Gegenstand der Verarbeitung sind, als dies für die Durchführung, Verwaltung und Überwachung des Vertrags unbedingt erforderlich ist. Der Auftragsverarbeiter gewährleistet, dass sich die zur Verarbeitung der erhaltenen personenbezogenen Daten befugten Personen zur Vertraulichkeit verpflichtet haben oder einer angemessenen gesetzlichen Verschwiegenheitspflicht unterliegen.",
                  ],
                },
              ],
            },
          ],
        },
        {
          number: "7.5.",
          heading: "Sensible Daten",
          blocks: [
            {
              kind: "p",
              text: "Falls die Verarbeitung personenbezogene Daten betrifft, aus denen die rassische oder ethnische Herkunft, politische Meinungen, religiöse oder weltanschauliche Überzeugungen oder die Gewerkschaftszugehörigkeit hervorgehen, oder die genetische Daten oder biometrische Daten zum Zweck der eindeutigen Identifizierung einer natürlichen Person, Daten über die Gesundheit, das Sexualleben oder die sexuelle Ausrichtung einer Person oder Daten über strafrechtliche Verurteilungen und Straftaten enthalten (im Folgenden „sensible Daten“), wendet der Auftragsverarbeiter spezielle Beschränkungen und/oder zusätzlichen Garantien an.",
            },
          ],
        },
        {
          number: "7.6.",
          heading: "Dokumentation und Einhaltung der Klauseln",
          blocks: [
            {
              kind: "list",
              items: [
                {
                  marker: "a)",
                  paragraphs: [
                    "Die Parteien müssen die Einhaltung dieser Klauseln nachweisen können.",
                  ],
                },
                {
                  marker: "b)",
                  paragraphs: [
                    "Der Auftragsverarbeiter bearbeitet Anfragen des Verantwortlichen bezüglich der Verarbeitung von Daten gemäß diesen Klauseln umgehend und in angemessener Weise.",
                  ],
                },
                {
                  marker: "c)",
                  paragraphs: [
                    "Der Auftragsverarbeiter stellt dem Verantwortlichen alle Informationen zur Verfügung, die für den Nachweis der Einhaltung der in diesen Klauseln festgelegten und unmittelbar aus der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 hervorgehenden Pflichten erforderlich sind. Auf Verlangen des Verantwortlichen gestattet der Auftragsverarbeiter ebenfalls die Prüfung der unter diese Klauseln fallenden Verarbeitungstätigkeiten in angemessenen Abständen oder bei Anzeichen für eine Nichteinhaltung und trägt zu einer solchen Prüfung bei. Bei der Entscheidung über eine Überprüfung oder Prüfung kann der Verantwortliche einschlägige Zertifizierungen des Auftragsverarbeiters berücksichtigen.",
                  ],
                },
                {
                  marker: "d)",
                  paragraphs: [
                    "Der Verantwortliche kann die Prüfung selbst durchführen oder einen unabhängigen Prüfer beauftragen. Die Prüfungen können auch Inspektionen in den Räumlichkeiten oder physischen Einrichtungen des Auftragsverarbeiters umfassen und werden gegebenenfalls mit angemessener Vorankündigung durchgeführt.",
                  ],
                },
                {
                  marker: "e)",
                  paragraphs: [
                    "Die Parteien stellen der/den zuständigen Aufsichtsbehörde(n) die in dieser Klausel genannten Informationen, einschließlich der Ergebnisse von Prüfungen, auf Anfrage zur Verfügung.",
                  ],
                },
              ],
            },
          ],
        },
        {
          number: "7.7.",
          heading: "Einsatz von Unterauftragsverarbeitern",
          blocks: [
            {
              kind: "list",
              items: [
                {
                  marker: "a)",
                  paragraphs: [
                    "OPTION 1: VORHERIGE GESONDERTE GENEHMIGUNG: Der Auftragsverarbeiter darf keinen seiner Verarbeitungsvorgänge, die er im Auftrag des Verantwortlichen gemäß diesen Klauseln durchführt, ohne vorherige gesonderte schriftliche Genehmigung des Verantwortlichen an einen Unterauftragsverarbeiter untervergeben. Der Auftragsverarbeiter reicht den Antrag auf die gesonderte Genehmigung mindestens [ZEITRAUM ANGEBEN] vor der Beauftragung des betreffenden Unterauftragsverarbeiters zusammen mit den Informationen ein, die der Verantwortliche benötigt, um über die Genehmigung zu entscheiden. Die Liste der vom Verantwortlichen genehmigten Unterauftragsverarbeiter findet sich in Anhang IV. Die Parteien halten Anhang IV jeweils auf dem neuesten Stand.",
                    "OPTION 2: ALLGEMEINE SCHRIFTLICHE GENEHMIGUNG: Der Auftragsverarbeiter besitzt die allgemeine Genehmigung des Verantwortlichen für die Beauftragung von Unterauftragsverarbeitern, die in einer vereinbarten Liste aufgeführt sind. Der Auftragsverarbeiter unterrichtet den Verantwortlichen mindestens [ZEITRAUM ANGEBEN] im Voraus ausdrücklich in schriftlicher Form über alle beabsichtigten Änderungen dieser Liste durch Hinzufügen oder Ersetzen von Unterauftragsverarbeitern und räumt dem Verantwortlichen damit ausreichend Zeit ein, um vor der Beauftragung des/der betreffenden Unterauftragsverarbeiter/s Einwände gegen diese Änderungen erheben zu können. Der Auftragsverarbeiter stellt dem Verantwortlichen die erforderlichen Informationen zur Verfügung, damit dieser sein Widerspruchsrecht ausüben kann.",
                  ],
                },
                {
                  marker: "b)",
                  paragraphs: [
                    "Beauftragt der Auftragsverarbeiter einen Unterauftragsverarbeiter mit der Durchführung bestimmter Verarbeitungstätigkeiten (im Auftrag des Verantwortlichen), so muss diese Beauftragung im Wege eines Vertrags erfolgen, der dem Unterauftragsverarbeiter im Wesentlichen dieselben Datenschutzpflichten auferlegt wie diejenigen, die für den Auftragsverarbeiter gemäß diesen Klauseln gelten. Der Auftragsverarbeiter stellt sicher, dass der Unterauftragsverarbeiter die Pflichten erfüllt, denen der Auftragsverarbeiter entsprechend diesen Klauseln und gemäß der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 unterliegt.",
                  ],
                },
                {
                  marker: "c)",
                  paragraphs: [
                    "Der Auftragsverarbeiter stellt dem Verantwortlichen auf dessen Verlangen eine Kopie einer solchen Untervergabevereinbarung und etwaiger späterer Änderungen zur Verfügung. Soweit es zum Schutz von Geschäftsgeheimnissen oder anderen vertraulichen Informationen, einschließlich personenbezogener Daten notwendig ist, kann der Auftragsverarbeiter den Wortlaut der Vereinbarung vor der Weitergabe einer Kopie unkenntlich machen.",
                  ],
                },
                {
                  marker: "d)",
                  paragraphs: [
                    "Der Auftragsverarbeiter haftet gegenüber dem Verantwortlichen in vollem Umfang dafür, dass der Unterauftragsverarbeiter seinen Pflichten gemäß dem mit dem Auftragsverarbeiter geschlossenen Vertrag nachkommt. Der Auftragsverarbeiter benachrichtigt den Verantwortlichen, wenn der Unterauftragsverarbeiter seine vertraglichen Pflichten nicht erfüllt.",
                  ],
                },
                {
                  marker: "e)",
                  paragraphs: [
                    "Der Auftragsverarbeiter vereinbart mit dem Unterauftragsverarbeiter eine Drittbegünstigtenklausel, wonach der Verantwortliche \u2013 im Falle, dass der Auftragsverarbeiter faktisch oder rechtlich nicht mehr besteht oder zahlungsunfähig ist \u2013 das Recht hat, den Untervergabevertrag zu kündigen und den Unterauftragsverarbeiter anzuweisen, die personenbezogenen Daten zu löschen oder zurückzugeben.",
                  ],
                },
              ],
            },
          ],
        },
        {
          number: "7.8.",
          heading: "Internationale Datenübermittlungen",
          blocks: [
            {
              kind: "list",
              items: [
                {
                  marker: "a)",
                  paragraphs: [
                    "Jede Übermittlung von Daten durch den Auftragsverarbeiter an ein Drittland oder eine internationale Organisation erfolgt ausschließlich auf der Grundlage dokumentierter Weisungen des Verantwortlichen oder zur Einhaltung einer speziellen Bestimmung nach dem Unionsrecht oder dem Recht eines Mitgliedstaats, dem der Auftragsverarbeiter unterliegt, und muss mit Kapitel V der Verordnung (EU) 2016/679 oder der Verordnung (EU) 2018/1725 im Einklang stehen.",
                  ],
                },
                {
                  marker: "b)",
                  paragraphs: [
                    "Der Verantwortliche erklärt sich damit einverstanden, dass in Fällen, in denen der Auftragsverarbeiter einen Unterauftragsverarbeiter gemäß Klausel 7.7 für die Durchführung bestimmter Verarbeitungstätigkeiten (im Auftrag des Verantwortlichen) in Anspruch nimmt und diese Verarbeitungstätigkeiten eine Übermittlung personenbezogener Daten im Sinne von Kapitel V der Verordnung (EU) 2016/679 beinhalten, der Auftragsverarbeiter und der Unterauftragsverarbeiter die Einhaltung von Kapitel V der Verordnung (EU) 2016/679 sicherstellen können, indem sie Standardvertragsklauseln verwenden, die von der Kommission gemäß Artikel 46 Absatz 2 der Verordnung (EU) 2016/679 erlassen wurden, sofern die Voraussetzungen für die Anwendung dieser Standardvertragsklauseln erfüllt sind.",
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      section: "II",
      number: 8,
      label: "Klausel 8",
      heading: "Unterstützung des Verantwortlichen",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "a)",
              paragraphs: [
                "Der Auftragsverarbeiter unterrichtet den Verantwortlichen unverzüglich über jeden Antrag, den er von der betroffenen Person erhalten hat. Er beantwortet den Antrag nicht selbst, es sei denn, er wurde vom Verantwortlichen dazu ermächtigt.",
              ],
            },
            {
              marker: "b)",
              paragraphs: [
                "Unter Berücksichtigung der Art der Verarbeitung unterstützt der Auftragsverarbeiter den Verantwortlichen bei der Erfüllung von dessen Pflicht, Anträge betroffener Personen auf Ausübung ihrer Rechte zu beantworten. Bei der Erfüllung seiner Pflichten gemäß den Buchstaben a und b befolgt der Auftragsverarbeiter die Weisungen des Verantwortlichen.",
              ],
            },
            {
              marker: "c)",
              paragraphs: [
                "Abgesehen von der Pflicht des Auftragsverarbeiters, den Verantwortlichen gemäß Klausel 8 Buchstabe b zu unterstützen, unterstützt der Auftragsverarbeiter unter Berücksichtigung der Art der Datenverarbeitung und der ihm zur Verfügung stehenden Informationen den Verantwortlichen zudem bei der Einhaltung der folgenden Pflichten:",
              ],
              items: [
                {
                  marker: "1)",
                  paragraphs: [
                    "Pflicht zur Durchführung einer Abschätzung der Folgen der vorgesehenen Verarbeitungsvorgänge für den Schutz personenbezogener Daten (im Folgenden „Datenschutz-Folgenabschätzung“), wenn eine Form der Verarbeitung voraussichtlich ein hohes Risiko für die Rechte und Freiheiten natürlicher Personen zur Folge hat;",
                  ],
                },
                {
                  marker: "2)",
                  paragraphs: [
                    "Pflicht zur Konsultation der zuständigen Aufsichtsbehörde(n) vor der Verarbeitung, wenn aus einer Datenschutz-Folgenabschätzung hervorgeht, dass die Verarbeitung ein hohes Risiko zur Folge hätte, sofern der Verantwortliche keine Maßnahmen zur Eindämmung des Risikos trifft;",
                  ],
                },
                {
                  marker: "3)",
                  paragraphs: [
                    "Pflicht zur Gewährleistung, dass die personenbezogenen Daten sachlich richtig und auf dem neuesten Stand sind, indem der Auftragsverarbeiter den Verantwortlichen unverzüglich unterrichtet, wenn er feststellt, dass die von ihm verarbeiteten personenbezogenen Daten unrichtig oder veraltet sind;",
                  ],
                },
                {
                  marker: "4)",
                  paragraphs: [
                    "Verpflichtungen gemäß [OPTION 1: Artikel 32 der Verordnung (EU) 2016/679] oder [OPTION 2: Artikel 33 und Artikel 36 bis 38 der Verordnung (EU) 2018/1725].",
                  ],
                },
              ],
            },
            {
              marker: "d)",
              paragraphs: [
                "Die Parteien legen in Anhang III die geeigneten technischen und organisatorischen Maßnahmen zur Unterstützung des Verantwortlichen durch den Auftragsverarbeiter bei der Anwendung dieser Klausel sowie den Anwendungsbereich und den Umfang der erforderlichen Unterstützung fest.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
    {
      section: "II",
      number: 9,
      label: "Klausel 9",
      heading: "Meldung von Verletzungen des Schutzes personenbezogener Daten",
      blocks: [
        {
          kind: "p",
          text: "Im Falle einer Verletzung des Schutzes personenbezogener Daten arbeitet der Auftragsverarbeiter mit dem Verantwortlichen zusammen und unterstützt ihn entsprechend, damit der Verantwortliche seinen Verpflichtungen gemäß den Artikeln 33 und 34 der Verordnung (EU) 2016/679 oder gegebenenfalls den Artikeln 34 und 35 der Verordnung (EU) 2018/1725 nachkommen kann, wobei der Auftragsverarbeiter die Art der Verarbeitung und die ihm zur Verfügung stehenden Informationen berücksichtigt.",
        },
      ],
      parts: [
        {
          number: "9.1.",
          heading:
            "Verletzung des Schutzes der vom Verantwortlichen verarbeiteten Daten",
          blocks: [
            {
              kind: "p",
              text: "Im Falle einer Verletzung des Schutzes personenbezogener Daten im Zusammenhang mit den vom Verantwortlichen verarbeiteten Daten unterstützt der Auftragsverarbeiter den Verantwortlichen wie folgt:",
            },
            {
              kind: "list",
              items: [
                {
                  marker: "a)",
                  paragraphs: [
                    "bei der unverzüglichen Meldung der Verletzung des Schutzes personenbezogener Daten an die zuständige(n) Aufsichtsbehörde(n), nachdem dem Verantwortlichen die Verletzung bekannt wurde, sofern relevant (es sei denn, die Verletzung des Schutzes personenbezogener Daten führt voraussichtlich nicht zu einem Risiko für die persönlichen Rechte und Freiheiten natürlicher Personen);",
                  ],
                },
                {
                  marker: "b)",
                  paragraphs: [
                    "bei der Einholung der folgenden Informationen, die gemäß [OPTION 1: Artikel 33 Absatz 3 der Verordnung (EU) 2016/679] oder [OPTION 2: Artikel 34 Absatz 3 der Verordnung (EU) 2018/1725] in der Meldung des Verantwortlichen anzugeben sind, wobei diese Informationen mindestens Folgendes umfassen müssen:",
                  ],
                  items: [
                    {
                      marker: "1)",
                      paragraphs: [
                        "die Art der personenbezogenen Daten, soweit möglich, mit Angabe der Kategorien und der ungefähren Zahl der betroffenen Personen sowie der Kategorien und der ungefähren Zahl der betroffenen personenbezogenen Datensätze;",
                      ],
                    },
                    {
                      marker: "2)",
                      paragraphs: [
                        "die wahrscheinlichen Folgen der Verletzung des Schutzes personenbezogener Daten;",
                      ],
                    },
                    {
                      marker: "3)",
                      paragraphs: [
                        "die vom Verantwortlichen ergriffenen oder vorgeschlagenen Maßnahmen zur Behebung der Verletzung des Schutzes personenbezogener Daten und gegebenenfalls Maßnahmen zur Abmilderung ihrer möglichen nachteiligen Auswirkungen.",
                      ],
                    },
                  ],
                },
              ],
            },
            {
              kind: "p",
              text: "Wenn und soweit nicht alle diese Informationen zur gleichen Zeit bereitgestellt werden können, enthält die ursprüngliche Meldung die zu jenem Zeitpunkt verfügbaren Informationen, und weitere Informationen werden, sobald sie verfügbar sind, anschließend ohne unangemessene Verzögerung bereitgestellt;",
            },
            {
              kind: "list",
              items: [
                {
                  marker: "c)",
                  paragraphs: [
                    "bei der Einhaltung der Pflicht gemäß [OPTION 1: Artikel 34 der Verordnung (EU) 2016/679] oder [OPTION 2: Artikel 35 der Verordnung (EU) 2018/1725], die betroffene Person unverzüglich von der Verletzung des Schutzes personenbezogener Daten zu benachrichtigen, wenn diese Verletzung voraussichtlich ein hohes Risiko für die Rechte und Freiheiten natürlicher Personen zur Folge hat.",
                  ],
                },
              ],
            },
          ],
        },
        {
          number: "9.2.",
          heading:
            "Verletzung des Schutzes der vom Auftragsverarbeiter verarbeiteten Daten",
          blocks: [
            {
              kind: "p",
              text: "Im Falle einer Verletzung des Schutzes personenbezogener Daten im Zusammenhang mit den vom Auftragsverarbeiter verarbeiteten Daten meldet der Auftragsverarbeiter diese dem Verantwortlichen unverzüglich, nachdem ihm die Verletzung bekannt wurde. Diese Meldung muss zumindest folgende Informationen enthalten:",
            },
            {
              kind: "list",
              items: [
                {
                  marker: "a)",
                  paragraphs: [
                    "eine Beschreibung der Art der Verletzung (möglichst unter Angabe der Kategorien und der ungefähren Zahl der betroffenen Personen und der ungefähren Zahl der betroffenen Datensätze);",
                  ],
                },
                {
                  marker: "b)",
                  paragraphs: [
                    "Kontaktdaten einer Anlaufstelle, bei der weitere Informationen über die Verletzung des Schutzes personenbezogener Daten eingeholt werden können;",
                  ],
                },
                {
                  marker: "c)",
                  paragraphs: [
                    "die voraussichtlichen Folgen und die ergriffenen oder vorgeschlagenen Maßnahmen zur Behebung der Verletzung des Schutzes personenbezogener Daten, einschließlich Maßnahmen zur Abmilderung ihrer möglichen nachteiligen Auswirkungen.",
                  ],
                },
              ],
            },
            {
              kind: "p",
              text: "Wenn und soweit nicht alle diese Informationen zur gleichen Zeit bereitgestellt werden können, enthält die ursprüngliche Meldung die zu jenem Zeitpunkt verfügbaren Informationen, und weitere Informationen werden, sobald sie verfügbar sind, anschließend ohne unangemessene Verzögerung bereitgestellt.",
            },
            {
              kind: "p",
              text: "Die Parteien legen in Anhang III alle sonstigen Angaben fest, die der Auftragsverarbeiter zur Verfügung zu stellen hat, um den Verantwortlichen bei der Erfüllung von dessen Pflichten gemäß [OPTION 1: Artikel 33 und 34 der Verordnung (EU) 2016/679] oder [OPTION 2: Artikel 34 und 35 der Verordnung (EU) 2018/1725] zu unterstützen.",
            },
          ],
        },
      ],
    },
    {
      section: "III",
      number: 10,
      label: "Klausel 10",
      heading: "Verstöße gegen die Klauseln und Beendigung des Vertrags",
      blocks: [
        {
          kind: "list",
          items: [
            {
              marker: "a)",
              paragraphs: [
                "Falls der Auftragsverarbeiter seinen Pflichten gemäß diesen Klauseln nicht nachkommt, kann der Verantwortliche \u2013 unbeschadet der Bestimmungen der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 \u2013 den Auftragsverarbeiter anweisen, die Verarbeitung personenbezogener Daten auszusetzen, bis er diese Klauseln einhält oder der Vertrag beendet ist. Der Auftragsverarbeiter unterrichtet den Verantwortlichen unverzüglich, wenn er aus welchen Gründen auch immer nicht in der Lage ist, diese Klauseln einzuhalten.",
              ],
            },
            {
              marker: "b)",
              paragraphs: [
                "Der Verantwortliche ist berechtigt, den Vertrag zu kündigen, soweit er die Verarbeitung personenbezogener Daten gemäß diesen Klauseln betrifft, wenn",
              ],
              items: [
                {
                  marker: "1)",
                  paragraphs: [
                    "der Verantwortliche die Verarbeitung personenbezogener Daten durch den Auftragsverarbeiter gemäß Buchstabe a ausgesetzt hat und die Einhaltung dieser Klauseln nicht innerhalb einer angemessenen Frist, in jedem Fall aber innerhalb eines Monats nach der Aussetzung, wiederhergestellt wurde;",
                  ],
                },
                {
                  marker: "2)",
                  paragraphs: [
                    "der Auftragsverarbeiter in erheblichem Umfang oder fortdauernd gegen diese Klauseln verstößt oder seine Verpflichtungen gemäß der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 nicht erfüllt;",
                  ],
                },
                {
                  marker: "3)",
                  paragraphs: [
                    "der Auftragsverarbeiter einer bindenden Entscheidung eines zuständigen Gerichts oder der zuständigen Aufsichtsbehörde(n), die seine Pflichten gemäß diesen Klauseln, der Verordnung (EU) 2016/679 und/oder der Verordnung (EU) 2018/1725 zum Gegenstand hat, nicht nachkommt.",
                  ],
                },
              ],
            },
            {
              marker: "c)",
              paragraphs: [
                "Der Auftragsverarbeiter ist berechtigt, den Vertrag zu kündigen, soweit er die Verarbeitung personenbezogener Daten gemäß diesen Klauseln betrifft, wenn der Verantwortliche auf der Erfüllung seiner Anweisungen besteht, nachdem er vom Auftragsverarbeiter darüber in Kenntnis gesetzt wurde, dass seine Anweisungen gegen geltende rechtliche Anforderungen gemäß Klausel 7.1 Buchstabe b verstoßen.",
              ],
            },
            {
              marker: "d)",
              paragraphs: [
                "Nach Beendigung des Vertrags löscht der Auftragsverarbeiter nach Wahl des Verantwortlichen alle im Auftrag des Verantwortlichen verarbeiteten personenbezogenen Daten und bescheinigt dem Verantwortlichen, dass dies erfolgt ist, oder er gibt alle personenbezogenen Daten an den Verantwortlichen zurück und löscht bestehende Kopien, sofern nicht nach dem Unionsrecht oder dem Recht der Mitgliedstaaten eine Verpflichtung zur Speicherung der personenbezogenen Daten besteht. Bis zur Löschung oder Rückgabe der Daten gewährleistet der Auftragsverarbeiter weiterhin die Einhaltung dieser Klauseln.",
              ],
            },
          ],
        },
      ],
      parts: [],
    },
  ],
  annexes: [
    {
      id: "I",
      label: "ANHANG I",
      title: "Liste der Parteien",
      paragraphs: [
        "Verantwortliche(r): [Name und Kontaktdaten des/der Verantwortlichen und gegebenenfalls des Datenschutzbeauftragten des Verantwortlichen]",
        "1.",
        "Name: …",
        "Anschrift: …",
        "Name, Funktion und Kontaktdaten der Kontaktperson: …",
        "Unterschrift und Beitrittsdatum: …",
        "2.",
        "…",
        "Auftragsverarbeiter: [Name und Kontaktdaten des/der Auftragsverarbeiter/s und gegebenenfalls des Datenschutzbeauftragten des Auftragsverarbeiters]",
        "1.",
        "Name: …",
        "Anschrift: …",
        "Name, Funktion und Kontaktdaten der Kontaktperson: …",
        "Unterschrift und Beitrittsdatum: …",
        "2.",
        "…",
      ],
    },
    {
      id: "II",
      label: "ANHANG II",
      title: "Beschreibung der Verarbeitung",
      paragraphs: [
        "Kategorien betroffener Personen, deren personenbezogene Daten verarbeitet werden",
        "…",
        "Kategorien personenbezogener Daten, die verarbeitet werden",
        "…",
        "Verarbeitete sensible Daten (falls zutreffend) und angewandte Beschränkungen oder Garantien, die der Art der Daten und den verbundenen Risiken in vollem Umfang Rechnung tragen, z. B. strenge Zweckbindung, Zugangsbeschränkungen (einschließlich des Zugangs nur für Mitarbeiter, die eine spezielle Schulung absolviert haben), Aufzeichnungen über den Zugang zu den Daten, Beschränkungen für Weiterübermittlungen oder zusätzliche Sicherheitsmaßnahmen",
        "…",
        "Art der Verarbeitung",
        "…",
        "Zweck(e), für den/die die personenbezogenen Daten im Auftrag des Verantwortlichen verarbeitet werden",
        "…",
        "Dauer der Verarbeitung",
        "…",
        "…",
        "Bei der Verarbeitung durch (Unter-)Auftragsverarbeiter sind auch Gegenstand, Art und Dauer der Verarbeitung anzugeben.",
      ],
    },
    {
      id: "III",
      label: "ANHANG III",
      title:
        "Technische und organisatorische Maßnahmen, einschließlich zur Gewährleistung der Sicherheit der Daten",
      paragraphs: [
        "ERLÄUTERUNG:",
        "Die technischen und organisatorischen Maßnahmen müssen konkret beschrieben werden; eine allgemeine Beschreibung ist nicht ausreichend.",
        "Beschreibung der von dem/den Verantwortlichen ergriffenen technischen und organisatorischen Sicherheitsmaßnahmen (einschließlich aller relevanten Zertifizierungen) zur Gewährleistung eines angemessenen Schutzniveaus unter Berücksichtigung der Art, des Umfangs, der Umstände und des Zwecks der Verarbeitung sowie der Risiken für die Rechte und Freiheiten natürlicher Personen Beispiele für mögliche Maßnahmen:",
        "Maßnahmen der Pseudonymisierung und Verschlüsselung personenbezogener Daten",
        "Maßnahmen zur fortdauernden Sicherstellung der Vertraulichkeit, Integrität, Verfügbarkeit und Belastbarkeit der Systeme und Dienste im Zusammenhang mit der Verarbeitung",
        "Maßnahmen zur Sicherstellung der Fähigkeit, die Verfügbarkeit der personenbezogenen Daten und den Zugang zu ihnen bei einem physischen oder technischen Zwischenfall rasch wiederherzustellen",
        "Verfahren zur regelmäßigen Überprüfung, Bewertung und Evaluierung der Wirksamkeit der technischen und organisatorischen Maßnahmen zur Gewährleistung der Sicherheit der Verarbeitung",
        "Maßnahmen zur Identifizierung und Autorisierung der Nutzer",
        "Maßnahmen zum Schutz der Daten während der Übermittlung",
        "Maßnahmen zum Schutz der Daten während der Speicherung",
        "Maßnahmen zur Gewährleistung der physischen Sicherheit von Orten, an denen personenbezogene Daten verarbeitet werden",
        "Maßnahmen zur Gewährleistung der Protokollierung von Ereignissen",
        "Maßnahmen zur Gewährleistung der Systemkonfiguration, einschließlich der Standardkonfiguration",
        "Maßnahmen für die interne Governance und Verwaltung der IT und der IT-Sicherheit",
        "Maßnahmen zur Zertifizierung/Qualitätssicherung von Prozessen und Produkten",
        "Maßnahmen zur Gewährleistung der Datenminimierung",
        "Maßnahmen zur Gewährleistung der Datenqualität",
        "Maßnahmen zur Gewährleistung einer begrenzten Vorratsdatenspeicherung",
        "Maßnahmen zur Gewährleistung der Rechenschaftspflicht",
        "Maßnahmen zur Ermöglichung der Datenübertragbarkeit und zur Gewährleistung der Löschung",
        "Bei Datenübermittlungen an (Unter-)Auftragsverarbeiter sind auch die spezifischen technischen und organisatorischen Maßnahmen zu beschreiben, die der (Unter-)Auftragsverarbeiter zur Unterstützung des Verantwortlichen ergreifen muss.",
        "Beschreibung der spezifischen technischen und organisatorischen Maßnahmen, die der Auftragsverarbeiter zur Unterstützung des Verantwortlichen ergreifen muss",
      ],
    },
    {
      id: "IV",
      label: "ANHANG IV",
      title: "Liste der Unterauftragsverarbeiter",
      paragraphs: [
        "ERLÄUTERUNG:",
        "Dieser Anhang muss im Falle einer gesonderten Genehmigung von Unterauftragsverarbeitern ausgefüllt werden (Klausel 7.7 Buchstabe a, Option 1).",
        "Der Verantwortliche hat die Inanspruchnahme folgender Unterauftragsverarbeiter genehmigt:",
        "1.",
        "Name: …",
        "Anschrift: …",
        "Name, Funktion und Kontaktdaten der Kontaktperson: …",
        "Beschreibung der Verarbeitung (einschließlich einer klaren Abgrenzung der Verantwortlichkeiten, falls mehrere Unterauftragsverarbeiter genehmigt werden): …",
        "2.",
        "…",
      ],
    },
  ],
};

/** The Clauses exactly as published, every option included. */
export const SCC: Record<SccLang, SccText> = { en: EN, de: DE };

/* ------------------------------------------------------------------ Choices */

/**
 * Clause 7.7(a), option 2: how many days before a change to the sub-processor
 * list the controller is told, so it has time to object.
 */
export const SUBPROCESSOR_NOTICE_DAYS = 30;

/** The period as it is written into Clause 7.7(a), per language. */
const NOTICE_PERIOD: Record<SccLang, string> = {
  en: `${SUBPROCESSOR_NOTICE_DAYS} days`,
  de: `${SUBPROCESSOR_NOTICE_DAYS} Tage`,
};

export type SccResolution =
  /** Replace a published fragment that offers options with the chosen one. */
  | { kind: "replace"; published: string; chosen: string }
  /** Remove a whole paragraph that holds the option that was not chosen. */
  | { kind: "dropParagraph"; startsWith: string };

/**
 * THE CHOICES THE CLAUSES ASK THE PARTIES TO MAKE. This is the only place
 * where the agreement departs from the published text, and only by selecting
 * among the options the Commission offers. Owner's legal review: confirm each.
 *
 * - regulation "gdpr": OPTION 1 wherever the text offers Regulation (EU)
 *   2016/679 or Regulation (EU) 2018/1725 (the latter binds Union institutions
 *   only).
 * - dockingClause true: the optional Clause 5 is part of the agreement.
 * - subprocessorAuthorisation "general": Clause 7.7(a) OPTION 2, general
 *   written authorisation, with the notice period above. The agreed list is
 *   Annex IV.
 */
export const DPA_CHOICES = {
  regulation: "gdpr",
  dockingClause: true,
  subprocessorAuthorisation: "general",
  subprocessorNoticeDays: SUBPROCESSOR_NOTICE_DAYS,
  noticePeriod: NOTICE_PERIOD,
  resolutions: {
    en: [
      {
        kind: "replace",
        published:
          "[choose relevant option: OPTION 1: Article 28(3) and (4) of Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 on the protection of natural persons with regard to the processing of personal data and on the free movement of such data, and repealing Directive 95/46/EC (General Data Protection Regulation)] / [OPTION 2: Article 29(3) and (4) of Regulation (EU) 2018/1725 of the European Parliament and of the Council of 23 October 2018 on the protection of natural persons with regard to the processing of personal data by the Union institutions, bodies, offices and agencies and on the free movement of such data, and repealing Regulation (EC) No 45/2001 and Decision No 1247/2002/EC]",
        chosen:
          "Article 28(3) and (4) of Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 on the protection of natural persons with regard to the processing of personal data and on the free movement of such data, and repealing Directive 95/46/EC (General Data Protection Regulation)",
      },
      {
        kind: "replace",
        published:
          "[OPTION 1] Article 32 of Regulation (EU) 2016/679/ [OPTION 2] Articles 33 and 36 to 38 of Regulation (EU) 2018/1725",
        chosen: "Article 32 of Regulation (EU) 2016/679",
      },
      {
        kind: "replace",
        published:
          "[OPTION 1] Article 33(3) of Regulation (EU) 2016/679/ [OPTION 2] Article 34(3) of Regulation (EU) 2018/1725",
        chosen: "Article 33(3) of Regulation (EU) 2016/679",
      },
      {
        kind: "replace",
        published:
          "[OPTION 1] Article 34 of Regulation (EU) 2016/679 / [OPTION 2] Article 35 of Regulation (EU) 2018/1725",
        chosen: "Article 34 of Regulation (EU) 2016/679",
      },
      {
        kind: "replace",
        published:
          "[OPTION 1] Articles 33 and 34 of Regulation (EU) 2016/679 / [OPTION 2] Articles 34 and 35 of Regulation (EU) 2018/1725",
        chosen: "Articles 33 and 34 of Regulation (EU) 2016/679",
      },
      {
        kind: "dropParagraph",
        startsWith: "OPTION 1: PRIOR SPECIFIC AUTHORISATION:",
      },
      {
        kind: "replace",
        published: "OPTION 2: GENERAL WRITTEN AUTHORISATION: ",
        chosen: "",
      },
      {
        kind: "replace",
        published: "[SPECIFY TIME PERIOD]",
        chosen: NOTICE_PERIOD.en,
      },
    ],
    de: [
      {
        kind: "replace",
        published:
          "[zutreffende Option auswählen: OPTION 1: Artikel 28 Absätze 3 und 4 der Verordnung (EU) 2016/679 des Europäischen Parlaments und des Rates vom 27. April 2016 zum Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten, zum freien Datenverkehr und zur Aufhebung der Richtlinie 95/46/EG (Datenschutz-Grundverordnung)] oder [OPTION 2: Artikel 29 Absätze 3 und 4 der Verordnung (EU) 2018/1725 des Europäischen Parlaments und des Rates vom 23. Oktober 2018 zum Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten durch die Organe, Einrichtungen und sonstigen Stellen der Union, zum freien Datenverkehr und zur Aufhebung der Verordnung (EG) Nr. 45/2001 und des Beschlusses Nr. 1247/2002/EG]",
        chosen:
          "Artikel 28 Absätze 3 und 4 der Verordnung (EU) 2016/679 des Europäischen Parlaments und des Rates vom 27. April 2016 zum Schutz natürlicher Personen bei der Verarbeitung personenbezogener Daten, zum freien Datenverkehr und zur Aufhebung der Richtlinie 95/46/EG (Datenschutz-Grundverordnung)",
      },
      {
        kind: "replace",
        published:
          "[OPTION 1: Artikel 32 der Verordnung (EU) 2016/679] oder [OPTION 2: Artikel 33 und Artikel 36 bis 38 der Verordnung (EU) 2018/1725]",
        chosen: "Artikel 32 der Verordnung (EU) 2016/679",
      },
      {
        kind: "replace",
        published:
          "[OPTION 1: Artikel 33 Absatz 3 der Verordnung (EU) 2016/679] oder [OPTION 2: Artikel 34 Absatz 3 der Verordnung (EU) 2018/1725]",
        chosen: "Artikel 33 Absatz 3 der Verordnung (EU) 2016/679",
      },
      {
        kind: "replace",
        published:
          "[OPTION 1: Artikel 34 der Verordnung (EU) 2016/679] oder [OPTION 2: Artikel 35 der Verordnung (EU) 2018/1725]",
        chosen: "Artikel 34 der Verordnung (EU) 2016/679",
      },
      {
        kind: "replace",
        published:
          "[OPTION 1: Artikel 33 und 34 der Verordnung (EU) 2016/679] oder [OPTION 2: Artikel 34 und 35 der Verordnung (EU) 2018/1725]",
        chosen: "Artikel 33 und 34 der Verordnung (EU) 2016/679",
      },
      {
        kind: "dropParagraph",
        startsWith: "OPTION 1: VORHERIGE GESONDERTE GENEHMIGUNG:",
      },
      {
        kind: "replace",
        published: "OPTION 2: ALLGEMEINE SCHRIFTLICHE GENEHMIGUNG: ",
        chosen: "",
      },
      {
        kind: "replace",
        published: "[ZEITRAUM ANGEBEN]",
        chosen: NOTICE_PERIOD.de,
      },
    ],
  },
} as const satisfies {
  regulation: "gdpr";
  dockingClause: boolean;
  subprocessorAuthorisation: "general" | "specific";
  subprocessorNoticeDays: number;
  noticePeriod: Record<SccLang, string>;
  resolutions: Record<SccLang, readonly SccResolution[]>;
};

/** A paragraph after the choices are applied; null when it is dropped. */
const resolveText = (lang: SccLang, text: string): string | null => {
  let out = text;
  for (const r of DPA_CHOICES.resolutions[lang] as readonly SccResolution[]) {
    if (r.kind === "dropParagraph") {
      if (out.startsWith(r.startsWith)) return null;
    } else {
      out = out.split(r.published).join(r.chosen);
    }
  }
  return out;
};

const resolveItems = (lang: SccLang, items: SccListItem[]): SccListItem[] =>
  items.map((it) => ({
    marker: it.marker,
    paragraphs: it.paragraphs
      .map((p) => resolveText(lang, p))
      .filter((p): p is string => p !== null),
    ...(it.items ? { items: resolveItems(lang, it.items) } : {}),
  }));

const resolveBlocks = (lang: SccLang, blocks: SccBlock[]): SccBlock[] =>
  blocks.flatMap((b): SccBlock[] => {
    if (b.kind === "list")
      return [{ kind: "list", items: resolveItems(lang, b.items) }];
    const text = resolveText(lang, b.text);
    return text === null ? [] : [{ kind: "p", text }];
  });

/**
 * The Clauses as the parties agree them: the published text with DPA_CHOICES
 * applied. This is what /dpa and the PDF render.
 */
export const resolvedClauses = (lang: SccLang): SccClause[] =>
  SCC[lang].clauses
    .filter((c) => DPA_CHOICES.dockingClause || c.number !== 5)
    .map((c) => ({
      ...c,
      blocks: resolveBlocks(lang, c.blocks),
      parts: c.parts.map((p) => ({
        ...p,
        blocks: resolveBlocks(lang, p.blocks),
      })),
    }));
