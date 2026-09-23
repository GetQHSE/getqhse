import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { i18n } from "../app/i18n.js";
import { LanguageSelect } from "./language-switcher.js";

function renderSelect() {
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <LanguageSelect />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(cleanup);

describe("LanguageSelect", () => {
  it("switches the interface to Arabic and mirrors the document", async () => {
    renderSelect();
    await userEvent.selectOptions(screen.getByLabelText("Langue de l’interface"), "ar");
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(document.documentElement.lang).toBe("ar");
    expect(screen.getByLabelText("لغة الواجهة")).toHaveValue("ar");
  });

  it("switches back to a left-to-right language", async () => {
    renderSelect();
    await userEvent.selectOptions(screen.getByLabelText("Langue de l’interface"), "en");
    await waitFor(() => expect(document.documentElement.dir).toBe("ltr"));
    expect(screen.getByLabelText("Interface language")).toHaveValue("en");
  });
});
