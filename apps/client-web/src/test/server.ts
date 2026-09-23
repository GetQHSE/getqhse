import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/** Handlers every authenticated screen relies on; tests may override them. */
export const defaultHandlers = [
  http.get("*/api/auth-context/preferences", () => HttpResponse.json({ locale: "fr" })),
  http.patch("*/api/auth-context/preferences", async ({ request }) =>
    HttpResponse.json(await request.json()),
  ),
];

export const server = setupServer(...defaultHandlers);
