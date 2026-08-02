import { describe, expect, it } from "vitest";

import { corsAllowedHeaders, corsMethods, parseCorsOrigins } from "./cors.js";

describe("CORS configuration", () => {
  it("defaults to localhost and 127.0.0.1 on the client web dev port", () => {
    expect(parseCorsOrigins(undefined)).toEqual(["http://localhost:5173", "http://127.0.0.1:5173"]);
  });

  it("trims, removes trailing slashes, and deduplicates configured origins", () => {
    expect(
      parseCorsOrigins(
        " http://localhost:5173/ , http://127.0.0.1:5173///, http://localhost:5173 , https://app.example.com/path?x=1#hash ",
      ),
    ).toEqual(["http://localhost:5173", "http://127.0.0.1:5173", "https://app.example.com"]);
  });

  it("exposes credential-friendly preflight methods and headers", () => {
    expect(corsMethods).toContain("OPTIONS");
    expect(corsMethods).toContain("POST");
    expect(corsAllowedHeaders).toEqual(
      expect.arrayContaining([
        "Authorization",
        "Content-Type",
        "X-Organization-Id",
        "X-Request-Id",
      ]),
    );
  });
});
