"""판정표의 모든 행에 사람의 답이 있어야 확정한다."""

import json
import subprocess
import unittest
from pathlib import Path

from helpers import Base, sentences

from decision_candidates import review_rows
from review_answers import answer_problems, row_keys


def _lines() -> list[dict]:
    return [{**line, "role": "narration", "speaker": "narrator", "emotion": "neutral"} for line in sentences("가.", "나.", "다.")]


class FinalizeNeedsAnswers(Base):
    def _merged(self) -> Path:
        document = {"id": "t", "tagger": "guyeon-skill", "draftHash": "x", "sentences": _lines(), "scenes": [{"from": 0, "to": 2, "summary": "끝"}]}
        return self.write_json("m.draft.json", document)

    def _finalize(self, merged: Path, answers: Path) -> subprocess.CompletedProcess:
        return self.run_script("finalize_draft.py", merged, self.dir / "r.draft.json", "--reviewer", "운영", "--answers", answers)

    def test_a_row_without_an_answer_is_refused_and_named(self) -> None:
        merged = self._merged()
        result = self._finalize(merged, self.answer_all(merged, answer=" "))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("답이 없습니다: 결말:0-2", result.stderr)
        self.assertFalse((self.dir / "r.draft.json").exists())

    def test_an_answer_for_a_row_not_in_the_table_is_refused(self) -> None:
        merged = self._merged()
        answers = json.loads(self.answer_all(merged).read_text(encoding="utf-8"))
        result = self._finalize(merged, self.write_json("extra.json", {**answers, "결말:1-2": "네"}))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("판정표에 없는 행입니다: 결말:1-2", result.stderr)

    def test_answers_are_recorded_with_the_review(self) -> None:
        merged = self._merged()
        result = self._finalize(merged, self.answer_all(merged))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        record = json.loads((self.dir / "r.draft.json").read_text(encoding="utf-8"))["reviewRecord"]
        self.assertEqual(record["answers"], {"결말:0-2": "권장대로"})
        self.assertEqual(record["answeredRows"], 1)


class AnswerKeys(unittest.TestCase):
    def test_two_review_notes_on_one_sentence_are_asked_in_one_row(self) -> None:
        lines = [{**line, "notes": ["검수 요청: 하나", "검수 요청: 둘"]} for line in _lines()[1:2]]
        self.assertEqual([(row["kind"], row["ask"]) for row in review_rows(lines, set())], [("검수 요청", "하나 / 둘")])

    def _same_span_rows(self) -> list[dict]:
        row = {"kind": "긴 구간", "from": 1, "to": 1, "ask": "하나"}
        return [row, {**row, "ask": "둘"}]

    def test_rows_with_the_same_span_get_separate_keys(self) -> None:
        self.assertEqual(row_keys(self._same_span_rows()), ["긴 구간:1-1", "긴 구간:1-1#2"])

    def test_one_answer_does_not_pass_two_rows_with_the_same_span(self) -> None:
        problems = answer_problems(self._same_span_rows(), {"긴 구간:1-1": "네"})
        self.assertEqual(problems, ["답이 없습니다: 긴 구간:1-1#2 (둘)"])

    def test_both_rows_with_the_same_span_answered_pass(self) -> None:
        self.assertEqual(answer_problems(self._same_span_rows(), {"긴 구간:1-1": "네", "긴 구간:1-1#2": "아니오"}), [])

if __name__ == "__main__":
    unittest.main()
