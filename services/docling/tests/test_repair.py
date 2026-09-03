"""Covers the decision to re-convert a PDF whose text layer decoded to nothing usable.

`app.main` imports Docling, which is a heavy dependency that carries model weights and is only
present inside the service image. A minimal stand-in is installed in `sys.modules` first so the
repair logic can be exercised anywhere, including a CI job that never builds the image. Nothing
here touches the real converter; every conversion is scripted.
"""

import sys
import types
import unittest
from enum import Enum
from pathlib import Path


def _install_docling_stub() -> None:
    if "docling" in sys.modules:
        return

    class OcrMode(str, Enum):
        FULL_PAGE = "full_page"
        DEFAULT = "default"

    class _Options:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class PdfPipelineOptions:
        def __init__(self):
            self.do_ocr = False
            self.do_table_structure = False
            self.ocr_options = None
            self.heading_hierarchy_options = None
            self.generate_parsed_pages = False

    class DocumentConverter:
        def __init__(self, format_options=None):
            self.format_options = format_options

        def convert(self, path):  # pragma: no cover - never reached in these tests
            raise RuntimeError("the real converter is not available under test")

    base_models = types.ModuleType("docling.datamodel.base_models")
    base_models.InputFormat = Enum("InputFormat", {"PDF": "pdf"})
    pipeline_options = types.ModuleType("docling.datamodel.pipeline_options")
    pipeline_options.OcrMode = OcrMode
    pipeline_options.PdfPipelineOptions = PdfPipelineOptions
    pipeline_options.TesseractCliOcrOptions = _Options
    pipeline_options.HeadingHierarchyOptions = _Options
    document_converter = types.ModuleType("docling.document_converter")
    document_converter.DocumentConverter = DocumentConverter
    document_converter.PdfFormatOption = _Options

    datamodel = types.ModuleType("docling.datamodel")
    docling = types.ModuleType("docling")
    sys.modules.update(
        {
            "docling": docling,
            "docling.datamodel": datamodel,
            "docling.datamodel.base_models": base_models,
            "docling.datamodel.pipeline_options": pipeline_options,
            "docling.document_converter": document_converter,
        }
    )


_install_docling_stub()

from app.main import ConversionOutcome, repair_degenerate_text_layer  # noqa: E402
from app.segmentation import ExtractedBlock, ExtractedPage  # noqa: E402

BROKEN_PAGE = (
    "\x03HW\x03GH\x03OHXUV\x03JURXSHPHQWV\x03UHOqYH\x03GH\x03OD\x03FRPSpWHQFH\x03GHV\x03FRXUV\n"
    "MXULGLFWLRQV\x03ILQDQFLqUHV\x11\x031¶HVW\x03SDV\x03DSSOLFDEOH\x03DX[\x03JURXSHPHQWV\n"
) * 4

REPAIRED_PAGE = (
    "Le contrôle des finances des collectivités locales et de leurs groupements relève de la "
    "compétence des cours régionales des comptes, conformément à la loi formant code des "
    "juridictions financières.\n"
    "N'est pas applicable aux groupements le contrôle prévu par la loi relative au contrôle "
    "financier de l'Etat sur les entreprises publiques.\n"
)


def outcome(text: str, provider: str = "docling") -> ConversionOutcome:
    return ConversionOutcome(
        pages=[ExtractedPage(page_number=1, text=text)],
        blocks=[ExtractedBlock(block_type="text", text=text, page_number=1)],
        provider=provider,
        metadata={"conversion_status": "success"},
    )


class RepairDegenerateTextLayerTests(unittest.TestCase):
    def setUp(self):
        from app import main

        self.main = main
        self.original_extract = main.extract_with_docling
        self.addCleanup(setattr, main, "extract_with_docling", self.original_extract)

    def script(self, result):
        calls: list[str] = []

        def fake_extract(path, document_converter):
            calls.append("full_page")
            if isinstance(result, Exception):
                raise result
            return result

        self.main.extract_with_docling = fake_extract
        return calls

    def test_re_converts_with_full_page_ocr_when_the_text_layer_is_unusable(self):
        calls = self.script(outcome(REPAIRED_PAGE))

        repaired = repair_degenerate_text_layer(Path("law.pdf"), outcome(BROKEN_PAGE))

        # Docling's default OCR mode skips regions that already hold text cells, so a PDF whose
        # cells decode to garbage is never OCR'd. Forcing the pass is the only way through.
        self.assertEqual(calls, ["full_page"])
        self.assertEqual(repaired.provider, "docling+full_page_ocr")
        self.assertIn("compétence des cours régionales", repaired.text)
        self.assertEqual(repaired.metadata["text_layer_repair"], "applied")
        self.assertEqual(
            repaired.metadata["text_layer_reason_before_repair"], "control_characters_in_text"
        )

    def test_leaves_a_sound_text_layer_alone(self):
        calls = self.script(outcome(REPAIRED_PAGE))

        kept = repair_degenerate_text_layer(Path("standard.pdf"), outcome(REPAIRED_PAGE))

        # Full-page OCR is the expensive path; a document that extracted cleanly must not pay
        # for it. The measurements still travel with the response.
        self.assertEqual(calls, [])
        self.assertEqual(kept.provider, "docling")
        self.assertEqual(kept.metadata["text_layer_degenerate"], "false")
        self.assertEqual(kept.metadata["text_layer_reason"], "ok")

    def test_keeps_the_original_when_the_ocr_pass_comes_back_no_better(self):
        self.script(outcome(BROKEN_PAGE))

        kept = repair_degenerate_text_layer(Path("law.pdf"), outcome(BROKEN_PAGE))

        self.assertEqual(kept.provider, "docling")
        self.assertEqual(kept.metadata["text_layer_repair"], "rejected")

    def test_keeps_the_original_when_the_ocr_pass_raises(self):
        self.script(RuntimeError("tesseract exited 1"))

        kept = repair_degenerate_text_layer(Path("law.pdf"), outcome(BROKEN_PAGE))

        # A failed repair must never lose the text that was already extracted, poor as it is.
        self.assertEqual(kept.provider, "docling")
        self.assertEqual(kept.metadata["text_layer_repair"], "failed")
        self.assertIn("text_layer_degenerate", kept.metadata)

    def test_reports_the_measurements_that_drove_the_decision(self):
        self.script(outcome(REPAIRED_PAGE))

        repaired = repair_degenerate_text_layer(Path("law.pdf"), outcome(BROKEN_PAGE))

        for key in ("text_layer_mean_word_length", "text_layer_space_ratio"):
            self.assertIn(key, repaired.metadata)


if __name__ == "__main__":
    unittest.main()
