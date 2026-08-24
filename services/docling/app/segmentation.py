from pydantic import BaseModel, Field


class ExtractedPage(BaseModel):
    page_number: int = Field(ge=1)
    text: str


class ExtractedBlock(BaseModel):
    block_type: str
    text: str
    page_number: int = Field(ge=1)
    bounding_box: list[float] | None = None


# Docling tags every layout item with a label. Running headers/footers and footnotes are
# repeated on (or interrupt) every page; letting them stay inline in page text scrambles
# whatever provision happens to span that spot, so they're excluded when rebuilding page text.
NOISE_BLOCK_TYPES = {"page_header", "page_footer", "footnote"}


def block_label(item) -> str:
    """Read an item's layout label, whether it is an enum or already a plain string."""
    label = getattr(item, "label", None)
    return str(getattr(label, "value", label) or "text")


def block_text(item, document) -> str:
    """Read an item's text, keeping a table's grid instead of flattening it.

    A table's `.text` is linear, so a penalty grid collapses into a run of words and the
    pairing between an offence and its fine is lost — which is exactly the context a
    downstream reader needs to tell whether a sanction applies. Markdown keeps the rows
    and columns intact. Docling's exporter signature has moved between releases, so both
    arities are attempted before falling back to the flattened text.
    """
    if block_label(item) == "table":
        exporter = getattr(item, "export_to_markdown", None)
        if callable(exporter):
            for arguments in ((document,), ()):
                try:
                    markdown = str(exporter(*arguments)).strip()
                except Exception:
                    continue
                if markdown:
                    return markdown
    return str(getattr(item, "text", "")).strip()


def pages_from_blocks(blocks: list[ExtractedBlock]) -> list[ExtractedPage]:
    """Rebuild per-page text from labeled blocks instead of Docling's flattened export.

    Joining each kept block on its own paragraph also prevents two unrelated items (a table
    row and the next article's heading, for example) from being fused onto a single line with
    no separating whitespace, which is what causes heading detection to miss them downstream.
    """
    texts_by_page: dict[int, list[str]] = {}
    for block in blocks:
        if block.block_type in NOISE_BLOCK_TYPES or not block.text.strip():
            continue
        texts_by_page.setdefault(block.page_number, []).append(block.text.strip())
    return [
        ExtractedPage(page_number=page_number, text="\n\n".join(texts))
        for page_number, texts in sorted(texts_by_page.items())
    ]
