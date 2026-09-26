/** Parties intéressées pertinentes — the demo template's screens, played locally. */
import bundle from "./pip.snapshots.json";
import { TemplateMockPage } from "./template-mock-page.js";

export function InterestedPartiesMockPage() {
  return <TemplateMockPage bundle={bundle} />;
}
