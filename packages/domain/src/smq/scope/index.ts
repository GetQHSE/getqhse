export interface Declaration {
  activitiesInclusion: "all" | "exclude_some" | null;
  activities: string;
  excludedActivities: string;
  activitiesReason: string;
  sitesCoverage: "all" | "specific" | null;
  sites: { name: string; type: string; address: string }[];
  productsInclusion: "all" | "exclude_some" | null;
  products: string;
  excludedProducts: string;
  productsReason: string;
  designDeclaration: "designs_own" | "customer_specifications" | null;
  designDetails: string;
  thirdPartyProperty: "yes" | "no" | null;
  thirdPartyPropertyDetails: string;
  notes: string;
}
export const emptyDeclaration = (): Declaration => ({
  activitiesInclusion: null,
  activities: "",
  excludedActivities: "",
  activitiesReason: "",
  sitesCoverage: null,
  sites: [],
  productsInclusion: null,
  products: "",
  excludedProducts: "",
  productsReason: "",
  designDeclaration: null,
  designDetails: "",
  thirdPartyProperty: null,
  thirdPartyPropertyDetails: "",
  notes: "",
});
export interface Facts {
  projectName: string;
  standard: string;
  profile: { key: string; value: string }[];
  issues: unknown[];
  parties: unknown[];
  requirements: { text: string; partyName: string }[];
}
export type Finding = {
  key: string;
  severity: "missing" | "attention" | "incoherence";
  evidence: string | null;
};
export function missingDeclarations(d: Declaration): string[] {
  const missing: string[] = [];
  if (!d.activitiesInclusion || !d.activities.trim()) missing.push("activities");
  if (
    d.activitiesInclusion === "exclude_some" &&
    (!d.excludedActivities.trim() || !d.activitiesReason.trim())
  )
    missing.push("activitiesExcluded");
  if (
    !d.sitesCoverage ||
    !d.sites.length ||
    d.sites.some((s) => !s.name.trim() || !s.address.trim())
  )
    missing.push("sites");
  if (!d.productsInclusion || !d.products.trim()) missing.push("products");
  if (
    d.productsInclusion === "exclude_some" &&
    (!d.excludedProducts.trim() || !d.productsReason.trim())
  )
    missing.push("productsExcluded");
  if (!d.designDeclaration) missing.push("design");
  if (
    !d.thirdPartyProperty ||
    (d.thirdPartyProperty === "yes" && !d.thirdPartyPropertyDetails.trim())
  )
    missing.push("property");
  return missing;
}
export function designProposal(d: Declaration) {
  return d.designDeclaration === "designs_own"
    ? "potentially_applicable"
    : d.designDeclaration === "customer_specifications"
      ? "candidate_non_applicable"
      : "requires_confirmation";
}
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
export function findings(d: Declaration, f: Facts): Finding[] {
  const rows: Finding[] = missingDeclarations(d).map((key) => ({
    key,
    severity: "missing",
    evidence: null,
  }));
  if (d.activitiesInclusion === "all" && d.excludedActivities.trim())
    rows.push({
      key: "activitiesContradiction",
      severity: "incoherence",
      evidence: d.excludedActivities,
    });
  if (d.productsInclusion === "all" && (d.excludedProducts.trim() || d.productsReason.trim()))
    rows.push({
      key: "productsContradiction",
      severity: "incoherence",
      evidence: d.excludedProducts,
    });
  if (!f.profile.length)
    rows.push({ key: "profileMissing", severity: "attention", evidence: null });
  if (!f.issues.length) rows.push({ key: "issuesMissing", severity: "attention", evidence: null });
  if (!f.parties.length)
    rows.push({ key: "partiesMissing", severity: "attention", evidence: null });
  if (d.sitesCoverage === "specific")
    rows.push({
      key: "sitesLimited",
      severity: "attention",
      evidence: d.sites.map((s) => s.name).join(", "),
    });
  const property = f.requirements.find((r) =>
    /(propriete (du|des) clients?|biens (du|des) clients?|donnees (du|des) clients?|customer.?s? property|client.?s? property|ممتلكات العميل|ممتلكات العملاء)/.test(
      norm(r.text),
    ),
  );
  if (d.thirdPartyProperty === "no" && property)
    rows.push({
      key: "propertyConflict",
      severity: "attention",
      evidence: `${property.partyName}: ${property.text}`,
    });
  const evidence = f.profile.map((p) => p.value).join("\n");
  for (const [key, list] of [
    ["activitiesEvidence", d.excludedActivities],
    ["productsEvidence", d.excludedProducts],
  ] as const) {
    const matching = list
      .split(/[\n;,]/)
      .map(norm)
      .filter((s) => s.length > 3 && norm(evidence).includes(s));
    if (matching.length) rows.push({ key, severity: "attention", evidence: matching.join(", ") });
  }
  return rows;
}
export function canVerify(d: Declaration, f: Facts, acknowledged: string[]) {
  return (
    !missingDeclarations(d).length &&
    findings(d, f).every(
      (r) =>
        r.severity !== "incoherence" &&
        (r.severity !== "attention" || acknowledged.includes(r.key)),
    )
  );
}
/** A model may repeat only the professional's exact non-applicability decision. */
export function validStatement(
  content: { statement: string; nonApplicable: { clause: string; justification: string }[] },
  material: {
    facts: Facts;
    declaration: Declaration;
    verification: { applicability: string; justification: string };
  },
): boolean {
  const s = content.statement.trim();
  const expected =
    material.verification.applicability === "not_applicable"
      ? [{ clause: "8.3", justification: material.verification.justification }]
      : [];
  return (
    s.length >= 80 &&
    s.length <= 1500 &&
    s.includes(material.facts.projectName) &&
    /iso\s*9001/i.test(s) &&
    material.declaration.sites.every((site) => s.includes(site.name)) &&
    JSON.stringify(content.nonApplicable) === JSON.stringify(expected) &&
    !/(certifi[eé]e? (iso|conforme)|certified (to|under)|conform[eé]ment aux exigences|est conforme [aà]|complies with|معتمد وفق)/i.test(
      s,
    )
  );
}
