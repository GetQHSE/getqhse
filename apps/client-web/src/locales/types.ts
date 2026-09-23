/**
 * A translation catalog must have exactly the keys of the French source.
 * Arabic may add the extra CLDR plural forms (zero, two, few, many) of any
 * pluralized key, since it distinguishes more quantities than French.
 */
type PluralExtras<T> = {
  [
    K in keyof T as K extends `${infer Base}_other`
      ? `${Base}_${"zero" | "two" | "few" | "many"}`
      : never
  ]?: string;
};

export type Catalog<T> = {
  [K in keyof T]: T[K] extends string ? string : Catalog<T[K]>;
} & PluralExtras<T>;
