import unittest

from app.quality import (
    MIN_ASSESSABLE_CHARACTERS,
    assess_text_layer,
    prefers_replacement,
)

# Lifted from tests/factories/09-08.pdf, whose fonts are subsetted CID fonts carrying no
# ToUnicode CMap: every glyph decodes 29 code points below its real character, spaces land on
# U+0003 and digits fall out of printable range entirely.
BROKEN_TEXT_LAYER = (
    "\x03HW\x03GH\x03OHXUV\nJURXSHPHQWV\x03UHOqYH\x03GH\x03OD\x03FRPSpWHQFH\x03GHV\x03FRXUV\n"
    "FRQIRUPpPHQW\x03j\x03OD\x03ORL\x03Q\x83\x03\x19\x15\x10\x1c\x1c\x03IRUPDQW\x03FRGH\x03GHV\n"
    "MXULGLFWLRQV\x03ILQDQFLqUHV\x11\n1¶HVW\x03SDV\x03DSSOLFDEOH\x03DX[\x03JURXSHPHQWV\n"
) * 3

# Lifted from tests/factories/22.0.010.pdf, a Moroccan standard that extracts cleanly.
CLEAN_TEXT_LAYER = (
    "La présente norme spécifie les conditions d'emballage des équipements et accessoires "
    "pour véhicules tels que définis dans la norme marocaine NM ISO 3833, ainsi que les "
    "indications communes qui doivent être portées par marquage qui sera apposé sur ces "
    "emballages ou sur une étiquette en vue de permettre l'identification des produits.\n"
    "Les dispositions de la présente norme s'appliquent aux fabricants, aux importateurs, "
    "distributeurs et aux responsables de la mise en vente sur le marché.\n"
)

CLEAN_ARABIC_TEXT_LAYER = (
    "يعاقب بغرامة من ألف ومائتين إلى خمسين ألف درهم كل من خالف أحكام هذا القانون، "
    "وإذا كان المخالف شخصا معنويا فإنه يعاقب بغرامة من خمسين ألف إلى مليون درهم.\n"
    "تطبق أحكام هذا الفصل على جميع المنشآت الخاضعة لأحكام هذا القانون دون استثناء.\n"
) * 2


# The same PDF as returned by Docling itself, rather than by a naive text extractor. Docling
# reconstructs the word spacing from the page geometry, so the words come out the right length
# and properly separated -- they are simply not words. Every structural check passes; only the
# vocabulary gives it away.
DOCLING_BROKEN_TEXT_LAYER = (
    "L  Q\x83         UHODWLYH  DX  FRQWU{OH  ILQDQFLHU  GH  O\u00b6(WDW  VXU  OHV\n\n"
    "HQWUHSULVHV  SXEOLTXHV  HW  DXWUHV  RUJDQLVPHV  SURPXOJXpH  SDU  OH\n\n"
    "(VW  IL[p  SDU  YRLH  UpJOHPHQWDLUH   OH  UpJLPH  GX  FRQWU{OH\n\n"
    "ILQDQFLHU  DSSOLFDEOH  DX[  pWDEOLVVHPHQWV  SXEOLFV  HW  DX[  VRFLpWpV\n\n"
    "TXH OHV FROOHFWLYLWpV ORFDOHV RX OHXUV JURXSHPHQWV FUpHQW RX GRQW\n\n"
) * 4


class AssessTextLayerTests(unittest.TestCase):
    def test_flags_a_pdf_whose_glyphs_never_decoded_to_characters(self):
        report = assess_text_layer(BROKEN_TEXT_LAYER)

        # Nothing else in the pipeline notices this document: it yields plenty of characters,
        # so the character-count check that gates OCR passes and the garbage reaches review.
        self.assertTrue(report.degenerate)
        self.assertEqual(report.reason, "control_characters_in_text")

    def test_flags_a_text_layer_that_lost_its_word_spacing(self):
        # The same failure after a parser has dropped the unmapped control codes rather than
        # emitting them: the words are simply run together.
        without_controls = "".join(
            character for character in BROKEN_TEXT_LAYER if character >= " " or character == "\n"
        )

        report = assess_text_layer(without_controls)

        self.assertTrue(report.degenerate)
        self.assertIn(report.reason, {"word_spacing_lost", "words_run_together"})

    def test_accepts_ordinary_french_prose(self):
        report = assess_text_layer(CLEAN_TEXT_LAYER)

        self.assertFalse(report.degenerate)
        self.assertEqual(report.reason, "ok")
        self.assertLess(report.mean_word_length, 12.0)

    def test_accepts_ordinary_arabic_prose(self):
        # Arabic words are short and spaced like French ones; the thresholds must not read a
        # perfectly good Arabic page as broken and send it through a needless OCR pass.
        report = assess_text_layer(CLEAN_ARABIC_TEXT_LAYER)

        self.assertFalse(report.degenerate)
        self.assertEqual(report.reason, "ok")

    def test_flags_text_whose_words_are_the_right_shape_but_are_not_words(self):
        report = assess_text_layer(DOCLING_BROKEN_TEXT_LAYER)

        # This is the case every other check misses. Spacing, word length and character class
        # all look like ordinary prose, because the parser rebuilt them from the page geometry;
        # the glyphs behind them decoded through a broken encoding. Measured on the real file,
        # function words run at 0.03 per thousand characters against 39 for a clean document.
        self.assertTrue(report.degenerate)
        self.assertEqual(report.reason, "no_recognizable_words")
        self.assertLess(report.mean_word_length, 12.0)
        self.assertEqual(report.control_ratio, 0.0)

    def test_does_not_need_a_document_language_to_recognize_words(self):
        # The check runs before the document's language is known, so it accepts any of the
        # languages this corpus is written in rather than assuming French.
        arabic = assess_text_layer(CLEAN_ARABIC_TEXT_LAYER * 4)

        self.assertFalse(arabic.degenerate)
        self.assertGreater(arabic.function_words_per_kilocharacter, 2.0)

    def test_flags_a_page_of_replacement_characters(self):
        report = assess_text_layer("�" * MIN_ASSESSABLE_CHARACTERS)

        self.assertTrue(report.degenerate)
        self.assertEqual(report.reason, "undecodable_characters")

    def test_will_not_judge_a_page_with_too_little_text(self):
        # A cover page or a mostly-graphical page is legitimately sparse. Calling those broken
        # would send every one of them through a full-page OCR pass for nothing.
        report = assess_text_layer("Norme Marocaine NM 22.0.010")

        self.assertFalse(report.degenerate)
        self.assertEqual(report.reason, "too_short_to_assess")


class PrefersReplacementTests(unittest.TestCase):
    def test_takes_the_ocr_pass_when_it_repaired_a_broken_text_layer(self):
        self.assertTrue(
            prefers_replacement(
                assess_text_layer(BROKEN_TEXT_LAYER), assess_text_layer(CLEAN_TEXT_LAYER)
            )
        )

    def test_keeps_the_original_when_the_ocr_pass_came_back_empty(self):
        # Forced OCR is a gamble; a pass that returns nothing must not replace the text that
        # was already there, poor as it is.
        self.assertFalse(
            prefers_replacement(assess_text_layer(BROKEN_TEXT_LAYER), assess_text_layer(""))
        )

    def test_keeps_the_original_when_the_ocr_pass_is_no_better(self):
        self.assertFalse(
            prefers_replacement(
                assess_text_layer(BROKEN_TEXT_LAYER), assess_text_layer(BROKEN_TEXT_LAYER)
            )
        )

    def test_never_replaces_a_text_layer_that_was_already_sound(self):
        self.assertFalse(
            prefers_replacement(
                assess_text_layer(CLEAN_TEXT_LAYER), assess_text_layer(CLEAN_TEXT_LAYER)
            )
        )


if __name__ == "__main__":
    unittest.main()
