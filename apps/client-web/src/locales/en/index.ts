import type fr from "../fr/index.js";
import type { Catalog } from "../types.js";
import auth from "./auth.js";
import common from "./common.js";
import regulatory from "./regulatory.js";
import context from "./context.js";
import onboarding from "./onboarding.js";
import profile from "./profile.js";
import workspace from "./workspace.js";

const en: Catalog<typeof fr> = {
  common,
  auth,
  onboarding,
  workspace,
  profile,
  context,
  regulatory,
};

export default en;
