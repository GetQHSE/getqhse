"""Judges whether an extracted text layer is usable at all.

A PDF can carry a text layer that decodes to nothing recoverable: subsetted CID fonts with
no ToUnicode CMap map every glyph to an arbitrary code point, so "Article" comes back as
"$UWLFOH" and digits drop out entirely. Docling's default OCR mode is PDF-aware -- it skips
regions that already hold text cells -- so it never OCRs those pages, and the garbage reaches
segmentation looking, by every cheap measure, like a successfully extracted document.

The signal that separates the two is how the characters clump. Real French or Arabic prose
runs about five characters to a word and spends roughly one character in seven on a space; a
broken text layer loses its spacing and its digits, and its "words" grow several times longer.
"""

import re
from dataclasses import dataclass

# Below this there is not enough text to judge: a cover page or a mostly-graphical page is
# legitimately sparse, and calling it broken would send every one of them through OCR.
MIN_ASSESSABLE_CHARACTERS = 200
# French and Arabic prose both sit near 5. Twelve is far outside anything a real page produces
# and comfortably clear of dense tabular text, which still keeps its spaces.
MAX_MEAN_WORD_LENGTH = 12.0
# Measured at 14.2% on a clean Moroccan standard and 3.4% on a law whose text layer is broken.
MIN_SPACE_RATIO = 0.06
# U+FFFD is what a decoder emits when it gives up on a glyph outright.
MAX_REPLACEMENT_RATIO = 0.02
# A subsetted font whose glyph ids sit below 0x20 decodes its spaces and digits into C0 control
# characters. Tab, newline and carriage return are ordinary layout and do not count.
MAX_CONTROL_RATIO = 0.01
_ALLOWED_CONTROLS = {"\t", "\n", "\r"}

# The check above cannot see the worst case. A parser that maps every glyph through a broken
# encoding still reconstructs the word spacing from the PDF's own geometry, so the result has
# ordinary-looking words of ordinary length -- "Article" simply arrives as "$UWLFOH". What it
# cannot fake is vocabulary: measured on a real Bulletin officiel law whose fonts carry no
# ToUnicode CMap, function words run at 0.03 per thousand characters against 39 per thousand
# for a cleanly extracted standard. Anything in between is not a close call.
MIN_FUNCTION_WORDS_PER_KILOCHARACTER = 2.0
# Applied only to a substantial run of text: a 200-character cover page legitimately holds few
# function words, whereas a whole document that holds none is not language at all.
MIN_LEXICAL_CHARACTERS = 1_000
# The most frequent function words of the languages this corpus is written in. English is
# included so a translated standard is never mistaken for a decoding failure.
_FUNCTION_WORDS = frozenset(
    """
    de la le les des du au aux et en un une dans sur pour par est sont ce cette que qui ne pas
    من في على أن هذا هذه التي الذي إلى عن مع كل أو لا ما
    the of and to in is are for on that with as by an be or not
    """.split()
)
_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)


@dataclass(frozen=True)
class TextLayerReport:
    characters: int
    mean_word_length: float
    space_ratio: float
    digit_ratio: float
    replacement_ratio: float
    control_ratio: float
    function_words_per_kilocharacter: float
    degenerate: bool
    reason: str

    def as_metadata(self) -> dict[str, str]:
        return {
            "text_layer_characters": str(self.characters),
            "text_layer_mean_word_length": f"{self.mean_word_length:.2f}",
            "text_layer_space_ratio": f"{self.space_ratio:.4f}",
            "text_layer_digit_ratio": f"{self.digit_ratio:.4f}",
            "text_layer_control_ratio": f"{self.control_ratio:.4f}",
            "text_layer_function_words": f"{self.function_words_per_kilocharacter:.2f}",
            "text_layer_degenerate": "true" if self.degenerate else "false",
            "text_layer_reason": self.reason,
        }


def assess_text_layer(text: str) -> TextLayerReport:
    characters = len(text)
    words = text.split()
    mean_word_length = sum(len(word) for word in words) / len(words) if words else 0.0
    space_ratio = text.count(" ") / characters if characters else 0.0
    digit_ratio = sum(character.isdigit() for character in text) / characters if characters else 0.0
    replacement_ratio = text.count("\ufffd") / characters if characters else 0.0
    controls = sum(
        character < " " and character not in _ALLOWED_CONTROLS for character in text
    )
    control_ratio = controls / characters if characters else 0.0
    function_words = sum(word in _FUNCTION_WORDS for word in _WORD.findall(text.lower()))
    function_words_per_kilocharacter = function_words / characters * 1_000 if characters else 0.0

    if characters < MIN_ASSESSABLE_CHARACTERS:
        reason = "too_short_to_assess"
        degenerate = False
    elif control_ratio > MAX_CONTROL_RATIO:
        reason = "control_characters_in_text"
        degenerate = True
    elif replacement_ratio > MAX_REPLACEMENT_RATIO:
        reason = "undecodable_characters"
        degenerate = True
    elif space_ratio < MIN_SPACE_RATIO:
        reason = "word_spacing_lost"
        degenerate = True
    elif mean_word_length > MAX_MEAN_WORD_LENGTH:
        reason = "words_run_together"
        degenerate = True
    elif (
        characters >= MIN_LEXICAL_CHARACTERS
        and function_words_per_kilocharacter < MIN_FUNCTION_WORDS_PER_KILOCHARACTER
    ):
        reason = "no_recognizable_words"
        degenerate = True
    else:
        reason = "ok"
        degenerate = False

    return TextLayerReport(
        characters=characters,
        mean_word_length=mean_word_length,
        space_ratio=space_ratio,
        digit_ratio=digit_ratio,
        replacement_ratio=replacement_ratio,
        control_ratio=control_ratio,
        function_words_per_kilocharacter=function_words_per_kilocharacter,
        degenerate=degenerate,
        reason=reason,
    )


def prefers_replacement(original: TextLayerReport, candidate: TextLayerReport) -> bool:
    """Decides whether a re-run with forced OCR produced something worth keeping.

    Forced OCR is a gamble: on a page whose text layer was merely sparse it can come back
    emptier than what it replaces. The re-run is only accepted when it is both assessable and
    no longer degenerate, so a failed OCR pass leaves the original output untouched.
    """
    if candidate.characters < MIN_ASSESSABLE_CHARACTERS:
        return False
    if candidate.degenerate:
        return False
    return original.degenerate
