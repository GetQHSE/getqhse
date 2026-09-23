import "i18next";

import type fr from "../locales/fr/index.js";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof fr;
    returnNull: false;
  }
}
