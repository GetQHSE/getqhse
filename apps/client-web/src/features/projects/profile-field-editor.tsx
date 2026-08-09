import type { ProfileFieldKey } from "@qhse/profile";
import { Button } from "@qhse/ui/components/button";
import { PlusIcon, Trash2Icon } from "lucide-react";

type TextEditor = {
  kind: "text";
  label: string;
  multiline?: boolean;
  optional?: boolean;
  inputType?: "text" | "url" | "date";
  placeholder?: string;
};
type NumberEditor = { kind: "number"; label: string; optional?: boolean };
type BooleanEditor = { kind: "boolean"; label: string };
type EnumEditor = {
  kind: "enum";
  label: string;
  optional?: boolean;
  options: Array<{ value: string; label: string }>;
};
type ArrayEditor = {
  kind: "array";
  label: string;
  item: EditorSchema;
  minimumItems?: number;
  addLabel?: string;
};
type ObjectEditor = {
  kind: "object";
  label?: string;
  fields: Record<string, EditorSchema>;
};
export type EditorSchema =
  TextEditor | NumberEditor | BooleanEditor | EnumEditor | ArrayEditor | ObjectEditor;

const text = (label: string, options: Omit<TextEditor, "kind" | "label"> = {}): TextEditor => ({
  kind: "text",
  label,
  ...options,
});
const list = (label: string, itemLabel: string): ArrayEditor => ({
  kind: "array",
  label,
  item: text(itemLabel),
  minimumItems: 1,
  addLabel: `Ajouter ${itemLabel.toLowerCase()}`,
});
const yesNoList = (label: string, booleanLabel: string, itemLabel: string): ObjectEditor => ({
  kind: "object",
  label,
  fields: {
    has: { kind: "boolean", label: booleanLabel },
    items: { kind: "array", label: "Détails", item: text(itemLabel), addLabel: "Ajouter" },
  },
});
const option = (value: string, label: string) => ({ value, label });

export const profileEditorSchemas: Record<ProfileFieldKey, EditorSchema> = {
  "project.name": text("Nom du projet", { placeholder: "Nom officiel de l’entité" }),
  "project.logoUrl": text("URL du logo", { inputType: "url", placeholder: "https://…" }),
  "organization.mission": text("Mission principale", { multiline: true }),
  "organization.offerings": {
    kind: "array",
    label: "Produits et services",
    minimumItems: 1,
    addLabel: "Ajouter un produit ou service",
    item: {
      kind: "object",
      fields: {
        name: text("Nom"),
        type: {
          kind: "enum",
          label: "Type",
          options: [option("PRODUCT", "Produit"), option("SERVICE", "Service")],
        },
        range: text("Gamme", { optional: true }),
        description: text("Description", { multiline: true, optional: true }),
      },
    },
  },
  "organization.offeringRanges": {
    kind: "object",
    fields: {
      hasMultiple: { kind: "boolean", label: "Plusieurs gammes" },
      ranges: {
        kind: "array",
        label: "Gammes",
        item: text("Nom de la gamme"),
        addLabel: "Ajouter une gamme",
      },
    },
  },
  "market.primaryCustomerSegments": list("Segments clients", "Segment client"),
  "organization.employeeCount": { kind: "number", label: "Nombre de salariés" },
  "operations.keyProcesses": {
    kind: "array",
    label: "Processus clés",
    minimumItems: 1,
    addLabel: "Ajouter un processus",
    item: {
      kind: "object",
      fields: {
        name: text("Nom du processus"),
        description: text("Description", { multiline: true, optional: true }),
        classification: {
          kind: "enum",
          label: "Classification",
          optional: true,
          options: [
            option("MANAGEMENT", "Management"),
            option("CORE", "Réalisation"),
            option("SUPPORT", "Support"),
          ],
        },
      },
    },
  },
  "scope.certificationScope": text("Périmètre de certification", { multiline: true }),
  "operations.externalProviders": {
    kind: "object",
    fields: {
      usesExternalProviders: { kind: "boolean", label: "Recours à des prestataires externes" },
      providers: {
        kind: "array",
        label: "Prestataires",
        addLabel: "Ajouter un prestataire",
        item: {
          kind: "object",
          fields: {
            name: text("Nom", { optional: true }),
            category: {
              kind: "enum",
              label: "Catégorie",
              options: [
                option("SUPPLIER", "Fournisseur"),
                option("SUBCONTRACTOR", "Sous-traitant"),
              ],
            },
            suppliedProductOrService: text("Produit ou service fourni"),
            outsourcedProcess: text("Processus externalisé", { optional: true }),
            critical: { kind: "boolean", label: "Prestataire critique" },
          },
        },
      },
    },
  },
  "organization.afterSalesServices": {
    kind: "object",
    fields: {
      hasAfterSalesServices: { kind: "boolean", label: "Service après-vente ou maintenance" },
      services: {
        kind: "array",
        label: "Services",
        addLabel: "Ajouter un service",
        item: {
          kind: "object",
          fields: {
            name: text("Nom du service"),
            description: text("Description", { multiline: true, optional: true }),
          },
        },
      },
    },
  },
  "scope.operatingReach": {
    kind: "enum",
    label: "Portée des activités",
    options: [
      option("LOCAL", "Locale"),
      option("NATIONAL", "Nationale"),
      option("INTERNATIONAL", "Internationale"),
    ],
  },
  "scope.operatingCountries": {
    kind: "array",
    label: "Pays d’activité",
    minimumItems: 1,
    addLabel: "Ajouter un pays",
    item: text("Code pays", { placeholder: "MA" }),
  },
  "organization.primarySector": {
    kind: "object",
    fields: {
      label: text("Secteur d’activité"),
      code: text("Code sectoriel", { optional: true }),
    },
  },
  "regulatory.implementedFrameworks": {
    kind: "object",
    fields: {
      hasImplementedFrameworks: { kind: "boolean", label: "Des référentiels sont déjà appliqués" },
      frameworks: {
        kind: "array",
        label: "Référentiels",
        addLabel: "Ajouter un référentiel",
        item: {
          kind: "object",
          fields: {
            type: {
              kind: "enum",
              label: "Type",
              options: [
                option("STANDARD", "Norme"),
                option("REGULATION", "Réglementation"),
                option("CERTIFICATION", "Certification"),
                option("OTHER", "Autre"),
              ],
            },
            reference: text("Référence", { optional: true }),
            name: text("Nom"),
            status: {
              kind: "enum",
              label: "Statut",
              options: [
                option("IMPLEMENTED", "Appliqué"),
                option("PARTIAL", "Partiellement appliqué"),
                option("PLANNED", "Planifié"),
                option("UNKNOWN", "À confirmer"),
              ],
            },
            scope: text("Périmètre", { multiline: true, optional: true }),
          },
        },
      },
    },
  },
  "operations.orderToDeliveryFlow": text("Déroulement commande-livraison", { multiline: true }),
  "resources.keyResources": {
    kind: "array",
    label: "Ressources clés",
    minimumItems: 1,
    addLabel: "Ajouter une ressource",
    item: {
      kind: "object",
      fields: {
        category: {
          kind: "enum",
          label: "Catégorie",
          options: [
            option("HUMAN", "Humaine"),
            option("EQUIPMENT", "Équipement"),
            option("SOFTWARE", "Logiciel"),
            option("INFRASTRUCTURE", "Infrastructure"),
            option("SUPPLIER", "Fournisseur"),
            option("OTHER", "Autre"),
          ],
        },
        name: text("Nom"),
        critical: { kind: "boolean", label: "Ressource critique" },
      },
    },
  },
  "resources.criticalCompetencies": list("Compétences critiques", "Compétence"),
  "operations.majorDifficulties": {
    ...yesNoList(
      "Difficultés majeures",
      "Des difficultés majeures ont été rencontrées",
      "Difficulté",
    ),
    fields: {
      has: { kind: "boolean", label: "Des difficultés majeures ont été rencontrées" },
      items: {
        kind: "array",
        label: "Difficultés",
        item: text("Difficulté"),
        addLabel: "Ajouter une difficulté",
      },
    },
  },
  "context.externalFactors": {
    kind: "array",
    label: "Facteurs externes",
    minimumItems: 1,
    addLabel: "Ajouter un facteur",
    item: {
      kind: "object",
      fields: {
        category: {
          kind: "enum",
          label: "Catégorie",
          options: [
            option("LEGAL", "Légal"),
            option("ECONOMIC", "Économique"),
            option("COMPETITION", "Concurrence"),
            option("TECHNOLOGY", "Technologie"),
            option("ENVIRONMENT", "Environnement"),
            option("SOCIAL", "Social"),
            option("OTHER", "Autre"),
          ],
        },
        description: text("Description", { multiline: true }),
      },
    },
  },
  "regulatory.knownRequirements": {
    kind: "object",
    fields: {
      hasKnownRequirements: { kind: "boolean", label: "Des exigences sont déjà connues" },
      requirements: {
        kind: "array",
        label: "Exigences",
        addLabel: "Ajouter une exigence",
        item: {
          kind: "object",
          fields: {
            name: text("Nom"),
            reference: text("Référence", { optional: true }),
            description: text("Description", { multiline: true, optional: true }),
          },
        },
      },
    },
  },
  "context.sectorChallenges": list("Défis du secteur", "Défi"),
  "stakeholders.customerNeeds": {
    kind: "array",
    label: "Clients et besoins",
    minimumItems: 1,
    addLabel: "Ajouter un type de client",
    item: {
      kind: "object",
      fields: {
        customerType: text("Type de client"),
        needs: list("Besoins", "Besoin"),
      },
    },
  },
  "stakeholders.otherParties": {
    kind: "array",
    label: "Parties intéressées",
    minimumItems: 1,
    addLabel: "Ajouter une partie",
    item: {
      kind: "object",
      fields: {
        category: {
          kind: "enum",
          label: "Catégorie",
          options: [
            option("EMPLOYEE", "Salarié"),
            option("SUPPLIER", "Fournisseur"),
            option("SUBCONTRACTOR", "Sous-traitant"),
            option("AUTHORITY", "Autorité"),
            option("BANK", "Banque"),
            option("PARTNER", "Partenaire"),
            option("OWNER", "Propriétaire"),
            option("COMMUNITY", "Communauté"),
            option("OTHER", "Autre"),
          ],
        },
        name: text("Nom", { optional: true }),
      },
    },
  },
  "stakeholders.expectations": {
    kind: "array",
    label: "Attentes des parties",
    minimumItems: 1,
    addLabel: "Ajouter une partie",
    item: {
      kind: "object",
      fields: {
        party: text("Partie intéressée"),
        expectations: list("Attentes", "Attente"),
      },
    },
  },
  "strategy.annualObjectives": {
    kind: "array",
    label: "Objectifs annuels",
    minimumItems: 1,
    addLabel: "Ajouter un objectif",
    item: {
      kind: "object",
      fields: {
        description: text("Objectif", { multiline: true }),
        target: text("Cible", { optional: true }),
        dueDate: text("Échéance", { inputType: "date", optional: true }),
        owner: text("Responsable", { optional: true }),
      },
    },
  },
  "strategy.values": list("Valeurs", "Valeur"),
  "strategy.differentiators": list("Facteurs différenciants", "Facteur"),
  "strategy.iso9001Motivation": text("Motivation ISO 9001", { multiline: true }),
  "context.marketChallenges": list("Défis du marché", "Défi"),
  "context.growthOpportunities": list("Opportunités de croissance", "Opportunité"),
  "regulatory.criticalRisks": list("Risques réglementaires critiques", "Risque"),
  "operations.recurrentIssues": {
    kind: "object",
    fields: {
      hasRecurrentIssues: { kind: "boolean", label: "Des incidents récurrents existent" },
      issues: {
        kind: "array",
        label: "Incidents ou non-conformités",
        addLabel: "Ajouter un incident",
        item: {
          kind: "object",
          fields: {
            description: text("Description", { multiline: true }),
            frequency: text("Fréquence", { optional: true }),
            impact: text("Impact", { multiline: true, optional: true }),
          },
        },
      },
    },
  },
};

export function initialEditorValue(schema: EditorSchema, value: unknown): unknown {
  if (value !== null && value !== undefined) {
    if (schema.kind === "object" && typeof value === "object" && !Array.isArray(value)) {
      const current = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(schema.fields).map(([key, child]) => [
          key,
          initialEditorValue(child, current[key]),
        ]),
      );
    }
    if (schema.kind === "array" && Array.isArray(value)) {
      return value.map((item) => initialEditorValue(schema.item, item));
    }
    return value;
  }
  if (schema.kind === "text" || schema.kind === "number") return "";
  if (schema.kind === "boolean") return false;
  if (schema.kind === "enum") return schema.optional ? "" : (schema.options[0]?.value ?? "");
  if (schema.kind === "object") {
    return Object.fromEntries(
      Object.entries(schema.fields).map(([key, child]) => [key, initialEditorValue(child, null)]),
    );
  }
  return Array.from({ length: schema.minimumItems ?? 0 }, () =>
    initialEditorValue(schema.item, null),
  );
}

export function cleanEditorValue(schema: EditorSchema, value: unknown): unknown {
  if (schema.kind === "text") {
    const cleaned = String(value ?? "").trim();
    return schema.optional && !cleaned ? undefined : cleaned;
  }
  if (schema.kind === "number") {
    if (schema.optional && String(value ?? "").trim() === "") return undefined;
    return Number(value);
  }
  if (schema.kind === "boolean") return Boolean(value);
  if (schema.kind === "enum") {
    const cleaned = String(value ?? "");
    return schema.optional && !cleaned ? undefined : cleaned;
  }
  if (schema.kind === "array") {
    return (Array.isArray(value) ? value : []).map((item) => cleanEditorValue(schema.item, item));
  }
  const record = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(schema.fields)
      .map(([key, child]) => [key, cleanEditorValue(child, record[key])] as const)
      .filter(([, childValue]) => childValue !== undefined),
  );
}

export function ProfileFieldEditor({
  schema,
  value,
  onChange,
  path = "field",
}: {
  schema: EditorSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  path?: string;
}) {
  if (schema.kind === "text") {
    const classes =
      "w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100";
    return (
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">
          {schema.label}
          {schema.optional && <span className="font-normal text-slate-400"> · facultatif</span>}
        </span>
        {schema.multiline ? (
          <textarea
            aria-label={schema.label}
            className={`${classes} min-h-24 py-2.5`}
            placeholder={schema.placeholder}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <input
            aria-label={schema.label}
            className={`${classes} h-10`}
            type={schema.inputType ?? "text"}
            placeholder={schema.placeholder}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </label>
    );
  }
  if (schema.kind === "number") {
    return (
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">{schema.label}</span>
        <input
          aria-label={schema.label}
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          type="number"
          min={0}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }
  if (schema.kind === "boolean") {
    const checked = Boolean(value);
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">{schema.label}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium ${checked ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-500"}`}
          >
            Oui
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium ${!checked ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-500"}`}
          >
            Non
          </button>
        </div>
      </div>
    );
  }
  if (schema.kind === "enum") {
    return (
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">{schema.label}</span>
        <select
          aria-label={schema.label}
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          {schema.optional && <option value="">Non renseigné</option>}
          {schema.options.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (schema.kind === "object") {
    const record = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
    return (
      <fieldset className="space-y-4">
        {schema.label && (
          <legend className="mb-3 text-sm font-semibold text-slate-900">{schema.label}</legend>
        )}
        {Object.entries(schema.fields).map(([key, child]) => (
          <ProfileFieldEditor
            key={key}
            schema={child}
            path={`${path}.${key}`}
            value={record[key]}
            onChange={(next) => onChange({ ...record, [key]: next })}
          />
        ))}
      </fieldset>
    );
  }
  const items = Array.isArray(value) ? value : [];
  const scalar = schema.item.kind !== "object" && schema.item.kind !== "array";
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-semibold text-slate-900">{schema.label}</legend>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={`${path}-${index}`}
            className={
              scalar
                ? "flex items-end gap-2"
                : "relative rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
            }
          >
            <div className="min-w-0 flex-1">
              <ProfileFieldEditor
                schema={schema.item}
                path={`${path}.${index}`}
                value={item}
                onChange={(next) =>
                  onChange(
                    items.map((current, itemIndex) => (itemIndex === index ? next : current)),
                  )
                }
              />
            </div>
            <Button
              aria-label={`Supprimer l’élément ${index + 1}`}
              type="button"
              size="icon-sm"
              variant="ghost"
              className={scalar ? "mb-1 text-slate-400" : "absolute right-2 top-2 text-slate-400"}
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        {!items.length && (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
            Aucun élément ajouté.
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => onChange([...items, initialEditorValue(schema.item, null)])}
      >
        <PlusIcon className="size-4" /> {schema.addLabel ?? "Ajouter un élément"}
      </Button>
    </fieldset>
  );
}
