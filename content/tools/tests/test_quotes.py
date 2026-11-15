"""글자 사이의 ’는 아포스트로피로 보고 따옴표 짝에서 뺀다. spike story_split과 같은 규칙이다."""

import json
import unittest
from pathlib import Path

from helpers import Base

from check_quotes import paragraph_problem, restoration_problems
from guyeon_common import PARAGRAPH_GAP

# spike 분할기의 골든을 그대로 읽어, 두 쪽이 같은 사례로 같은 판단을 하는지 본다.
SPLIT_GOLDEN = json.loads((Path(__file__).resolve().parents[3] / "gpu/spike/data/split-golden.json").read_text(encoding="utf-8"))


def _problems(body: str) -> list[str]:
    return [problem for paragraph in PARAGRAPH_GAP.split(body) if paragraph.strip() and (problem := paragraph_problem(paragraph))]


class Apostrophe(Base):
    def test_a_curly_apostrophe_inside_a_word_is_not_a_stray_closing_quote(self) -> None:
        self.assertEqual(restoration_problems("토토는 rock’n’roll을 좋아했다.\n", "토토는 rock’n’roll을 좋아했다.\n"), [])
        self.assertIsNone(paragraph_problem("‘엄마’s 집’이라고 적었다."))

    def test_a_closing_quote_after_a_word_still_closes_an_open_quote(self) -> None:
        self.assertIsNone(paragraph_problem("‘이상하다’라고 생각했다."))

    def test_an_apostrophe_inside_an_open_single_quote_is_not_its_close(self) -> None:
        self.assertIsNone(paragraph_problem("‘rock’n’roll이야’ 하고 생각했어요."))

    def test_a_closing_quote_before_a_particle_still_closes(self) -> None:
        self.assertIsNone(paragraph_problem("‘엄마’가 웃었어요. ‘아빠’를 불렀어요."))

    def test_a_closing_quote_after_punctuation_without_an_opening_one_is_refused(self) -> None:
        self.assertIsNotNone(paragraph_problem("이상하다.’ 생각했다."))


class SameCasesAsTheSplitter(Base):
    def test_every_body_the_splitter_accepts_has_balanced_quotes(self) -> None:
        self.assertEqual([problem for case in SPLIT_GOLDEN["cases"] for problem in _problems(case["body"])], [])

    def test_every_body_the_splitter_refuses_is_refused(self) -> None:
        self.assertEqual([case["id"] for case in SPLIT_GOLDEN["rejected"] if not _problems(case["body"])], [])


if __name__ == "__main__":
    unittest.main()
