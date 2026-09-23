import type { ProfileFieldKey } from "@qhse/profile";
import { Button } from "@qhse/ui/components/button";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CountryMultiSelect } from "../../components/country-multi-select.js";
import type fr from "../../locales/fr/profile.js";

/** Labels are keys of the `profile:editor` catalog, translated at render time. */
type Label = keyof (typeof fr)["editor"];

type TextEditor = {
  kind: "text";
  label: Label;
  multiline?: boolean;
  optional?: boolean;
  inputType?: "text" | "url" | "date";
  placeholder?: Label | "https://…";
};
type NumberEditor = { kind: "number"; label: Label; optional?: boolean };
type BooleanEditor = { kind: "boolean"; label: Label };
type EnumEditor = {
  kind: "enum";
  label: Label;
  optional?: boolean;
  options: Array<{ value: string; label: Label }>;
};
type ArrayEditor = {
  kind: "array";
  label: Label;
  item: EditorSchema;
  minimumItems?: number;
  addLabel?: Label;
  /** Renders "Add <item>" from the item's own label. */
  addNamed?: Label;
};
type ObjectEditor = {
  kind: "object";
  label?: Label;
  fields: Record<string, EditorSchema>;
};
/** ISO country codes, picked from the country list (max 5). */
type CountriesEditor = { kind: "countries"; label: Label };
export type EditorSchema =
  | TextEditor
  | NumberEditor
  | BooleanEditor
  | EnumEditor
  | ArrayEditor
  | ObjectEditor
  | CountriesEditor;

const text = (label: Label, options: Omit<TextEditor, "kind" | "label"> = {}): TextEditor => ({
  kind: "text",
  label,
  ...options,
});
const list = (label: Label, itemLabel: Label): ArrayEditor => ({
  kind: "array",
  label,
  item: text(itemLabel),
  minimumItems: 1,
  addNamed: itemLabel,
});
const yesNoList = (label: Label, booleanLabel: Label, itemLabel: Label): ObjectEditor => ({
  kind: "object",
  label,
  fields: {
    has: { kind: "boolean", label: booleanLabel },
    items: { kind: "array", label: "details", item: text(itemLabel), addLabel: "add" },
  },
});
const option = (value: string, label: Label) => ({ value, label });

export const profileEditorSchemas: Record<ProfileFieldKey, EditorSchema> = {
  "project.name": text("projectName", { placeholder: "projectNamePlaceholder" }),
  "project.logoUrl": text("logoUrl", { inputType: "url", placeholder: "https://…" }),
  "organization.mission": text("mission", { multiline: true }),
  "organization.offerings": {
    kind: "array",
    label: "offerings",
    minimumItems: 1,
    addLabel: "addOffering",
    item: {
      kind: "object",
      fields: {
        name: text("name"),
        type: {
          kind: "enum",
          label: "type",
          options: [option("PRODUCT", "product"), option("SERVICE", "service")],
        },
        range: text("range", { optional: true }),
        description: text("description", { multiline: true, optional: true }),
      },
    },
  },
  "organization.offeringRanges": {
    kind: "object",
    fields: {
      hasMultiple: { kind: "boolean", label: "hasMultipleRanges" },
      ranges: {
        kind: "array",
        label: "ranges",
        item: text("rangeName"),
        addLabel: "addRange",
      },
    },
  },
  "market.primaryCustomerSegments": list("customerSegments", "customerSegment"),
  "organization.employeeCount": { kind: "number", label: "employeeCount" },
  "operations.keyProcesses": {
    kind: "array",
    label: "keyProcesses",
    minimumItems: 1,
    addLabel: "addProcess",
    item: {
      kind: "object",
      fields: {
        name: text("processName"),
        description: text("description", { multiline: true, optional: true }),
        classification: {
          kind: "enum",
          label: "classification",
          optional: true,
          options: [
            option("MANAGEMENT", "management"),
            option("CORE", "core"),
            option("SUPPORT", "support"),
          ],
        },
      },
    },
  },
  "scope.certificationScope": text("certificationScope", { multiline: true }),
  "operations.externalProviders": {
    kind: "object",
    fields: {
      usesExternalProviders: { kind: "boolean", label: "usesExternalProviders" },
      providers: {
        kind: "array",
        label: "providers",
        addLabel: "addProvider",
        item: {
          kind: "object",
          fields: {
            name: text("name", { optional: true }),
            category: {
              kind: "enum",
              label: "category",
              options: [option("SUPPLIER", "supplier"), option("SUBCONTRACTOR", "subcontractor")],
            },
            suppliedProductOrService: text("suppliedProductOrService"),
            outsourcedProcess: text("outsourcedProcess", { optional: true }),
            critical: { kind: "boolean", label: "criticalProvider" },
          },
        },
      },
    },
  },
  "organization.afterSalesServices": {
    kind: "object",
    fields: {
      hasAfterSalesServices: { kind: "boolean", label: "hasAfterSales" },
      services: {
        kind: "array",
        label: "services",
        addLabel: "addService",
        item: {
          kind: "object",
          fields: {
            name: text("serviceName"),
            description: text("description", { multiline: true, optional: true }),
          },
        },
      },
    },
  },
  "scope.operatingReach": {
    kind: "enum",
    label: "operatingReach",
    options: [
      option("LOCAL", "local"),
      option("NATIONAL", "national"),
      option("INTERNATIONAL", "international"),
    ],
  },
  "scope.operatingCountries": { kind: "countries", label: "operatingCountries" },
  "organization.primarySector": {
    kind: "object",
    fields: {
      label: text("sector"),
      code: text("sectorCode", { optional: true }),
    },
  },
  "regulatory.implementedFrameworks": {
    kind: "object",
    fields: {
      hasImplementedFrameworks: { kind: "boolean", label: "hasFrameworks" },
      frameworks: {
        kind: "array",
        label: "frameworks",
        addLabel: "addFramework",
        item: {
          kind: "object",
          fields: {
            type: {
              kind: "enum",
              label: "type",
              options: [
                option("STANDARD", "standard"),
                option("REGULATION", "regulation"),
                option("CERTIFICATION", "certification"),
                option("OTHER", "other"),
              ],
            },
            reference: text("reference", { optional: true }),
            name: text("name"),
            status: {
              kind: "enum",
              label: "status",
              options: [
                option("IMPLEMENTED", "implemented"),
                option("PARTIAL", "partial"),
                option("PLANNED", "planned"),
                option("UNKNOWN", "unknown"),
              ],
            },
            scope: text("scope", { multiline: true, optional: true }),
          },
        },
      },
    },
  },
  "operations.orderToDeliveryFlow": text("orderToDelivery", { multiline: true }),
  "resources.keyResources": {
    kind: "array",
    label: "keyResources",
    minimumItems: 1,
    addLabel: "addResource",
    item: {
      kind: "object",
      fields: {
        category: {
          kind: "enum",
          label: "category",
          options: [
            option("HUMAN", "human"),
            option("EQUIPMENT", "equipment"),
            option("SOFTWARE", "software"),
            option("INFRASTRUCTURE", "infrastructure"),
            option("SUPPLIER", "supplier"),
            option("OTHER", "other"),
          ],
        },
        name: text("name"),
        critical: { kind: "boolean", label: "criticalResource" },
      },
    },
  },
  "resources.criticalCompetencies": list("criticalCompetencies", "competency"),
  "operations.majorDifficulties": {
    ...yesNoList("majorDifficulties", "hasDifficulties", "difficulty"),
    fields: {
      has: { kind: "boolean", label: "hasDifficulties" },
      items: {
        kind: "array",
        label: "difficulties",
        item: text("difficulty"),
        addLabel: "addDifficulty",
      },
    },
  },
  "context.externalFactors": {
    kind: "array",
    label: "externalFactors",
    minimumItems: 1,
    addLabel: "addFactor",
    item: {
      kind: "object",
      fields: {
        category: {
          kind: "enum",
          label: "category",
          options: [
            option("LEGAL", "legal"),
            option("ECONOMIC", "economic"),
            option("COMPETITION", "competition"),
            option("TECHNOLOGY", "technology"),
            option("ENVIRONMENT", "environment"),
            option("SOCIAL", "social"),
            option("OTHER", "other"),
          ],
        },
        description: text("description", { multiline: true }),
      },
    },
  },
  "regulatory.knownRequirements": {
    kind: "object",
    fields: {
      hasKnownRequirements: { kind: "boolean", label: "hasKnownRequirements" },
      requirements: {
        kind: "array",
        label: "requirements",
        addLabel: "addRequirement",
        item: {
          kind: "object",
          fields: {
            name: text("name"),
            reference: text("reference", { optional: true }),
            description: text("description", { multiline: true, optional: true }),
          },
        },
      },
    },
  },
  "context.sectorChallenges": list("sectorChallenges", "challenge"),
  "stakeholders.customerNeeds": {
    kind: "array",
    label: "customerNeeds",
    minimumItems: 1,
    addLabel: "addCustomerType",
    item: {
      kind: "object",
      fields: {
        customerType: text("customerType"),
        needs: list("needs", "need"),
      },
    },
  },
  "stakeholders.otherParties": {
    kind: "array",
    label: "interestedParties",
    minimumItems: 1,
    addLabel: "addParty",
    item: {
      kind: "object",
      fields: {
        category: {
          kind: "enum",
          label: "category",
          options: [
            option("EMPLOYEE", "employee"),
            option("SUPPLIER", "supplier"),
            option("SUBCONTRACTOR", "subcontractor"),
            option("AUTHORITY", "authority"),
            option("BANK", "bank"),
            option("PARTNER", "partner"),
            option("OWNER", "owner"),
            option("COMMUNITY", "community"),
            option("OTHER", "other"),
          ],
        },
        name: text("name", { optional: true }),
      },
    },
  },
  "stakeholders.expectations": {
    kind: "array",
    label: "partyExpectations",
    minimumItems: 1,
    addLabel: "addParty",
    item: {
      kind: "object",
      fields: {
        party: text("party"),
        expectations: list("expectations", "expectation"),
      },
    },
  },
  "strategy.annualObjectives": {
    kind: "array",
    label: "annualObjectives",
    minimumItems: 1,
    addLabel: "addObjective",
    item: {
      kind: "object",
      fields: {
        description: text("objective", { multiline: true }),
        target: text("target", { optional: true }),
        dueDate: text("dueDate", { inputType: "date", optional: true }),
        owner: text("responsible", { optional: true }),
      },
    },
  },
  "strategy.values": list("values", "value"),
  "strategy.differentiators": list("differentiators", "factor"),
  "strategy.iso9001Motivation": text("iso9001Motivation", { multiline: true }),
  "context.marketChallenges": list("marketChallenges", "challenge"),
  "context.growthOpportunities": list("growthOpportunities", "opportunity"),
  "regulatory.criticalRisks": list("criticalRisks", "risk"),
  "operations.recurrentIssues": {
    kind: "object",
    fields: {
      hasRecurrentIssues: { kind: "boolean", label: "hasRecurrentIssues" },
      issues: {
        kind: "array",
        label: "recurrentIssues",
        addLabel: "addIssue",
        item: {
          kind: "object",
          fields: {
            description: text("description", { multiline: true }),
            frequency: text("frequency", { optional: true }),
            impact: text("impact", { multiline: true, optional: true }),
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
  if (schema.kind === "countries") return [];
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
  if (schema.kind === "countries") {
    return (Array.isArray(value) ? value : []).map((code) => String(code).toUpperCase());
  }
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
  const { t, i18n } = useTranslation("profile");
  const label = (key: Label) => t(`editor.${key}`);
  if (schema.kind === "countries") {
    return (
      <div>
        <span className="mb-2 block text-sm font-medium text-slate-700">{label(schema.label)}</span>
        <CountryMultiSelect
          label={label(schema.label)}
          value={Array.isArray(value) ? value.map(String) : []}
          onChange={onChange}
        />
      </div>
    );
  }
  if (schema.kind === "text") {
    const placeholder =
      schema.placeholder === undefined || schema.placeholder === "https://…"
        ? schema.placeholder
        : label(schema.placeholder);
    const classes =
      "w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100";
    return (
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">
          {label(schema.label)}
          {schema.optional && (
            <span className="font-normal text-slate-400">{t("editorUi.optional")}</span>
          )}
        </span>
        {schema.multiline ? (
          <textarea
            aria-label={label(schema.label)}
            className={`${classes} min-h-24 py-2.5`}
            placeholder={placeholder}
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <input
            aria-label={label(schema.label)}
            className={`${classes} h-10`}
            type={schema.inputType ?? "text"}
            placeholder={placeholder}
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
        <span className="mb-2 block text-sm font-medium text-slate-700">{label(schema.label)}</span>
        <input
          aria-label={label(schema.label)}
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
        <p className="mb-2 text-sm font-medium text-slate-700">{label(schema.label)}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium ${checked ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-500"}`}
          >
            {t("editorUi.yes")}
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium ${!checked ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-500"}`}
          >
            {t("editorUi.no")}
          </button>
        </div>
      </div>
    );
  }
  if (schema.kind === "enum") {
    return (
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-slate-700">{label(schema.label)}</span>
        <select
          aria-label={label(schema.label)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          {schema.optional && <option value="">{t("editorUi.notProvided")}</option>}
          {schema.options.map((item) => (
            <option key={item.value} value={item.value}>
              {label(item.label)}
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
          <legend className="mb-3 text-sm font-semibold text-slate-900">
            {label(schema.label)}
          </legend>
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
      <legend className="mb-3 text-sm font-semibold text-slate-900">{label(schema.label)}</legend>
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
              aria-label={t("editorUi.removeItem", { index: index + 1 })}
              type="button"
              size="icon-sm"
              variant="ghost"
              className={scalar ? "mb-1 text-slate-400" : "absolute end-2 top-2 text-slate-400"}
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        {!items.length && (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
            {t("editorUi.noItems")}
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
        <PlusIcon className="size-4" />{" "}
        {schema.addLabel
          ? label(schema.addLabel)
          : schema.addNamed
            ? t("editorUi.addNamed", {
                item: label(schema.addNamed).toLocaleLowerCase(i18n.language),
              })
            : t("editorUi.addItem")}
      </Button>
    </fieldset>
  );
}
