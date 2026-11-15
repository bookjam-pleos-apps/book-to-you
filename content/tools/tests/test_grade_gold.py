"""정답 세트 채점 시험."""

import json

from helpers import Base

from check_quotes import QUOTE_MARKS
from grade_gold import restoration_score

# 정답 세트는 레포 밖(작업 폴더의 _gold/)에 둔다. 시험은 짧은 예문으로 채점 규칙만 고정한다.
GOLD_TEXT = "토토가 문을 열었어요.\n\n“누구세요?” 토토가 물었어요.\n\n“나야, 콩이.”\n"


class GradeGold(Base):
    def setUp(self) -> None:
        super().setUp()
        self.gold = GOLD_TEXT

    def test_gold_against_itself_scores_one(self) -> None:
        self.assertEqual(restoration_score(self.gold, self.gold), {"spokenRecall": 1.0, "spokenPrecision": 1.0})

    def test_missing_quote_pair_lowers_recall_only(self) -> None:
        missing = self.gold.replace("“", "", 1).replace("”", "", 1)
        score = restoration_score(missing, self.gold)
        self.assertLess(score["spokenRecall"], 1.0)
        self.assertEqual(score["spokenPrecision"], 1.0)

    def test_strip_removes_every_quote(self) -> None:
        out = self.dir / "toto.txt"
        self.assertEqual(self.run_script("grade_gold.py", "--strip", self.write_text("toto.gold.txt", GOLD_TEXT), out).returncode, 0)
        text = out.read_text(encoding="utf-8")
        self.assertFalse(any(mark in text for mark in QUOTE_MARKS))
        self.assertTrue(text.strip())

    def test_labels_agree_with_a_confirmed_story(self) -> None:
        story = [
            {"text": "토토가 나왔어요.", "style": "calm", "pauseAfterMs": 450, "speaker": "narrator", "emotion": "neutral"},
            {"text": "“눈이다!”", "style": "excited", "pauseAfterMs": 450, "speaker": "토토", "emotion": "joy"},
        ]
        gold = self.write_json("toto.json", {"version": 1, "id": "toto", "title": "토토", "sentences": story})
        draft = self.write_json("d.json", {"sentences": [{"index": i, "text": line["text"], "pauseMs": 450} for i, line in enumerate(story)]})
        labels = self.write_json("l.json", {"annotations": [{"index": 1, "speaker": "토토", "emotion": "joy"}]})
        restored = self.write_text("r.txt", "토토가 나왔어요. “눈이다!”")
        result = self.run_script("grade_gold.py", gold, restored, "--labels", labels, "--draft", draft)
        self.assertEqual(result.returncode, 0, result.stderr)
        graded = json.loads(result.stdout)
        self.assertEqual((graded["spokenRecall"], graded["boundaryMatch"], graded["alignedSentences"]), (1.0, 1.0, 2))
        self.assertEqual((graded["styleAgreement"], graded["speakerAgreement"]), (0.5, 1.0))
