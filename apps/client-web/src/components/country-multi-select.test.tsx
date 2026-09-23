import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CountryMultiSelect } from "./country-multi-select.js";

afterEach(cleanup);

describe("CountryMultiSelect", () => {
  it("shows the selected countries by name and removes one on click", async () => {
    const onChange = vi.fn();
    render(<CountryMultiSelect label="Pays" value={["MA", "FR"]} onChange={onChange} />);

    expect(screen.getByText("2 / 5 pays sélectionnés")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retirer France" }));

    expect(onChange).toHaveBeenCalledWith(["MA"]);
  });

  it("stops accepting new countries at five", () => {
    render(
      <CountryMultiSelect label="Pays" value={["MA", "FR", "TN", "DZ", "SN"]} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("Pays")).toBeDisabled();
    expect(screen.getByPlaceholderText("5 pays maximum")).toBeInTheDocument();
  });
});
