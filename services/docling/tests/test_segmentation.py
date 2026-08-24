import unittest

from app.segmentation import ExtractedBlock, pages_from_blocks


class PagesFromBlocksTests(unittest.TestCase):
    def test_drops_repeated_page_headers_and_footers_from_body_text(self):
        blocks = [
            ExtractedBlock(block_type="page_header", text="Bulletin Officiel n° 6404", page_number=18),
            ExtractedBlock(
                block_type="section_header", text="Article 91", page_number=18
            ),
            ExtractedBlock(
                block_type="text",
                text="Si le contrevenant est une personne morale, il sera puni d’une amende.",
                page_number=18,
            ),
            ExtractedBlock(block_type="page_footer", text="Page 18 sur 40", page_number=18),
        ]

        pages = pages_from_blocks(blocks)

        self.assertEqual(len(pages), 1)
        self.assertNotIn("Bulletin Officiel", pages[0].text)
        self.assertNotIn("Page 18 sur 40", pages[0].text)
        self.assertIn("Article 91", pages[0].text)
        self.assertIn("personne morale", pages[0].text)

    def test_keeps_a_blank_line_between_every_block_so_none_run_together(self):
        blocks = [
            ExtractedBlock(block_type="table", text="1.200 à 50.000 dirhams", page_number=23),
            ExtractedBlock(block_type="section_header", text="Article 92", page_number=23),
        ]

        pages = pages_from_blocks(blocks)

        self.assertEqual(
            pages[0].text, "1.200 à 50.000 dirhams\n\nArticle 92"
        )

    def test_groups_blocks_by_page_and_orders_pages_ascending(self):
        blocks = [
            ExtractedBlock(block_type="text", text="page two content", page_number=2),
            ExtractedBlock(block_type="text", text="page one content", page_number=1),
        ]

        pages = pages_from_blocks(blocks)

        self.assertEqual([page.page_number for page in pages], [1, 2])
        self.assertEqual(pages[0].text, "page one content")
        self.assertEqual(pages[1].text, "page two content")

    def test_returns_no_pages_when_every_block_is_noise_or_empty(self):
        blocks = [
            ExtractedBlock(block_type="page_header", text="Running title", page_number=1),
            ExtractedBlock(block_type="text", text="   ", page_number=1),
        ]

        self.assertEqual(pages_from_blocks(blocks), [])


if __name__ == "__main__":
    unittest.main()
