# GetQHSE

GetQHSE builds a human-reviewed regulatory watch from a project profile and preserves where each proposed or published row came from.

## Language

**Regulatory candidate**:
A potentially applicable law awaiting a system or human applicability decision. A stored article or clause is evidence for understanding a law, not a separate candidate.
_Avoid_: Missing law, source-required warning

**Normative document**:
The ingested, versioned full text of a law or standard. It is authoritative source material and does not define the set of laws considered applicable to a project.
_Avoid_: Candidate catalog, applicability catalog

**Platform provision**:
A structural slice of a normative document used for source traceability and exact-text extraction, never as the unit of project applicability.
_Avoid_: Sourced law

**Discovered law**:
A law identified from the project profile whose official provision text has not yet been ingested. In the MVP, it participates in review, evaluation and export like any other regulatory register entry.
_Avoid_: Missing law, blocked law

**Regulatory register entry**:
A published applicable law in the project’s regulatory watch, with any supporting source and extracted obligations kept as evidence beneath that law.
_Avoid_: Result row

**Analysis review**:
A person’s optional quality assessment of one completed regulatory analysis. It is either submitted with a zero-to-five rating and an optional comment, or explicitly skipped. Submitted analysis reviews contribute examples to the platform’s shared regulatory knowledge.
_Avoid_: AI training, candidate decision

**Regulatory knowledge**:
The platform-wide collection of active knowledge examples that later AI features may consult, regardless of which organization contributed their provenance. It never contains another organization’s raw project profile or evidence.
_Avoid_: Organization knowledge, training data

**Knowledge example**:
An administrator-approved, sanitized example for one AI feature. Customer feedback or a confirmed human correction may provide its provenance, but does not influence AI until it becomes a knowledge example.
_Avoid_: Customer record, training example
