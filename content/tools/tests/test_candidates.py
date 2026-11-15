"""판정표 후보 시험."""

import unittest

from helpers import sentences

from decision_candidates import cast_rows, isolated, mismatches, split_by_start, style_runs


def _story(*pairs: tuple[str, str, str]) -> list[dict]:
    """(문장, 화자, 녹음). 감정은 화자가 인물이면 anger로 둔다."""
    lines = sentences(*[text for text, _, _ in pairs])
    return [
        {**line, "speaker": speaker, "suggestedStyle": style, "emotion": "neutral" if speaker == "narrator" else "anger"}
        for line, (_, speaker, style) in zip(lines, pairs)
    ]


class CastFixedLines(unittest.TestCase):
    """인물 녹음으로 정한 대사는 문장마다 묻지 않고, 인물 하나에 한 번 묻는다."""

    def setUp(self) -> None:
        self.lines = _story(("서술.", "narrator", "calm"), ("“흥!”", "아내", "excited"), ("서술.", "narrator", "calm"), ("“전해!”", "아내", "excited"))
        self.fixed = {"아내": "excited"}

    def test_cast_lines_are_not_asked_one_by_one(self) -> None:
        self.assertEqual(isolated(style_runs(self.lines), self.fixed), [])
        self.assertEqual(mismatches(self.lines, self.fixed), [])

    def test_without_cast_the_same_lines_are_asked(self) -> None:
        self.assertEqual(len(isolated(style_runs(self.lines))), 1)
        self.assertEqual(len(mismatches(self.lines)), 2)

    def test_one_row_per_character_names_the_clashing_emotion(self) -> None:
        [row] = cast_rows(self.lines, self.fixed)
        self.assertEqual((row["from"], row["to"], row["style"]), (1, 1, "excited"))
        self.assertIn("대사 2개를 모두 excited", row["ask"])
        self.assertIn("anger", row["ask"])


class SplitByStart(unittest.TestCase):
    def test_identical_rows_are_not_lost(self) -> None:
        row = {"kind": "검수 요청", "from": 2, "to": 2, "ask": "같은 내용"}
        kept, overflow = split_by_start([row, dict(row)], set())
        self.assertEqual((len(kept), len(overflow)), (1, 1))

    def test_taken_starts_go_to_overflow(self) -> None:
        rows = [{"kind": "결말", "from": index["index"], "to": index["index"], "ask": "x"} for index in sentences("가.", "나.")]
        kept, overflow = split_by_start(rows, {0})
        self.assertEqual(([row["from"] for row in kept], [row["from"] for row in overflow]), ([1], [0]))


if __name__ == "__main__":
    unittest.main()
