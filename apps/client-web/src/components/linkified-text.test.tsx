import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExternalLink, LinkifiedText } from "./linkified-text.js";

afterEach(cleanup);

describe("clickable text links", () => {
  it("preserves surrounding prose and punctuation while linking raw and Markdown URLs", () => {
    const { container } = render(
      <p>
        <LinkifiedText>
          {
            "Consulter https://example.com/Act_(2026)#article-2, puis (www.example.org/source).\n[Texte officiel](https://example.net/Act_(2026)) et https://example.ma/texte؛"
          }
        </LinkifiedText>
      </p>,
    );
    expect(
      screen.getByRole("link", { name: "https://example.com/Act_(2026)#article-2" }),
    ).toHaveAttribute("href", "https://example.com/Act_(2026)#article-2");
    expect(screen.getByRole("link", { name: "www.example.org/source" })).toHaveAttribute(
      "href",
      "https://www.example.org/source",
    );
    expect(screen.getByRole("link", { name: "Texte officiel" })).toHaveAttribute(
      "href",
      "https://example.net/Act_(2026)",
    );
    expect(screen.getByRole("link", { name: "https://example.ma/texte" })).toHaveAttribute(
      "href",
      "https://example.ma/texte",
    );
    expect(container.textContent).toBe(
      "Consulter https://example.com/Act_(2026)#article-2, puis (www.example.org/source).\nTexte officiel et https://example.ma/texte؛",
    );
  });

  it("opens source links in a new tab without triggering a containing row", async () => {
    const openRow = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={openRow}>
        <ExternalLink href="  www.example.org/source  ">Source</ExternalLink>
      </div>,
    );
    const link = screen.getByRole("link", { name: "Source" });
    expect(link).toHaveAttribute("href", "https://www.example.org/source");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await user.click(link);
    expect(openRow).not.toHaveBeenCalled();
  });

  it("removes mixed surrounding brackets while preserving balanced URL parentheses", () => {
    const text = "[Consulter (https://example.ma/Act_(2026))].";
    const { container } = render(<LinkifiedText>{text}</LinkifiedText>);
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://example.ma/Act_(2026)");
    expect(container.textContent).toBe(text);
  });

  it("keeps invalid and unsafe URLs as text and never interprets HTML", () => {
    const { container } = render(
      <>
        <ExternalLink href="javascript:alert(1)">Unsafe source</ExternalLink>
        <ExternalLink href="https://">Invalid source</ExternalLink>
        <LinkifiedText>{"<script>alert(1)</script> [Unsafe](javascript:alert(1))"}</LinkifiedText>
      </>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("Unsafe source")).toBeInTheDocument();
  });
});
