# GetQHSE

GetQHSE builds a human-reviewed regulatory watch from a project profile and preserves where each proposed or published row came from.

## Language

**Regulatory candidate**:
A potentially applicable law or provision awaiting a system or human applicability decision.
_Avoid_: Missing law, source-required warning

**Platform provision**:
An ingested, versioned provision whose official text is available to the regulatory analysis.
_Avoid_: Sourced law

**Discovered law**:
A law identified from the project profile whose official provision text has not yet been ingested. In the MVP, it participates in review, evaluation and export like any other regulatory register entry.
_Avoid_: Missing law, blocked law

**Regulatory register entry**:
A published applicable row in the project’s regulatory watch. It may represent either a platform provision or a discovered law.
_Avoid_: Result row
