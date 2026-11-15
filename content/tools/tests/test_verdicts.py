"""판정이 인물 녹음(cast)에 조용히 덮이지 않는지. compare_labels → apply_verdicts를 실제로 돌린다."""

import json
import subprocess
import unittest

from helpers import Base, labels_for, sentences

from label_rules import label_values

LINES = sentences("“와!”", "둘이 웃었다.")
TOTO = {"index": 0, "speaker": "토토", "emotion": "joy"}


def _labels(cast_style: str, **extra: object) -> dict:
    return labels_for(LINES, cast=[{"name": "토토", "voiceType": "아기", "style": cast_style}], annotations=[TOTO], **extra)


class VerdictAgainstCast(Base):
    def _apply(self, first: dict, review: dict, pick_review: bool) -> subprocess.CompletedProcess:
        draft = self.write_json("d.draft.json", {"id": "t", "tagger": "rule", "sentences": LINES})
        a, b = self.write_json("a.json", first), self.write_json("b.json", review)
        folder = self.dir / "judge"
        self.assertEqual(self.run_script("compare_labels.py", draft, a, b, folder).returncode, 0)
        items = json.loads((folder / "labels.judge.json").read_text(encoding="utf-8"))["items"]
        key = json.loads((folder / "private" / "labels.key.json").read_text(encoding="utf-8"))["firstSide"]
        other = {"A": "B", "B": "A"}
        chosen = [{"id": item["id"], "verdict": other[key[item["id"]]] if pick_review else key[item["id"]], "reason": "이유"} for item in items]
        verdicts = self.write_json("v.json", {"items": chosen})
        return self.run_script("apply_verdicts.py", draft, a, b, folder, verdicts, self.dir / "final.json")

    def test_a_verdict_for_the_review_cast_style_is_refused_when_the_first_cast_would_override_it(self) -> None:
        result = self._apply(_labels("excited"), _labels("calm"), pick_review=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("0번: 판정은 calm인데 인물 녹음(cast) 때문에 excited로 읽힙니다", result.stderr)
        self.assertFalse((self.dir / "final.json").exists())

    def test_a_verdict_for_the_first_cast_style_passes(self) -> None:
        self.assertEqual(self._apply(_labels("excited"), _labels("calm"), pick_review=False).returncode, 0)

    def test_verdicts_pass_when_both_casts_agree(self) -> None:
        review = _labels("excited", excited=[{"index": 1, "reason": "웃음"}])
        result = self._apply(_labels("excited"), review, pick_review=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        final = json.loads((self.dir / "final.json").read_text(encoding="utf-8"))
        self.assertEqual([value["style"] for value in label_values(final, 2)], ["excited", "excited"])


if __name__ == "__main__":
    unittest.main()
