import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

import { i18n } from "../app/i18n.js";
import { server } from "./server.js";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
// Tests assert the French source strings: pin the interface language.
beforeEach(async () => {
  await i18n.changeLanguage("fr");
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
