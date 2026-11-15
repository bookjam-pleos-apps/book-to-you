"""판정자 평가용으로 심은 라벨 시험."""

import json
import random
import unittest

from helpers import Base, labels_for, sentences

from plant_errors import plan_plants

STORY = (
    ("숲에 늑대가 살았어요.", None), ("“배고프다.”", "늑대"), ("빨간 모자가 걸어왔어요.", None), ("“안녕하세요.”", "빨간 모자"),
    ("“어디 가니?”", "늑대"), ("“할머니 댁에요.”", "빨간 모자"), ("사냥꾼이 나타났어요.", None), ("“거기 서라!”", "사냥꾼"),
    ("“살려 줘!”", "늑대"), ("모두 돌아갔어요.", None), ("해가 졌어요.", None), ("끝.", None),
)
CAST = [
    {"name": "늑대", "voiceType": "아빠", "style": "deep"},
    {"name": "빨간 모자", "voiceType": "아기", "style": "child"},
    {"name": "사냥꾼", "voiceType": "아빠", "style": "calm"},
]


def _labels(lines: list[dict], cast: list[dict]) -> dict:
    notes = [{"index": i, "speaker": speaker, "emotion": "neutral"} for i, (_, speaker) in enumerate(STORY) if speaker]
    return labels_for(lines, cast=cast, annotations=notes)


class PlantInCastStory(Base):
    def setUp(self) -> None:
        super().setUp()
        self.lines = sentences(*[text for text, _ in STORY])
        self.draft = self.write_json("d.draft.json", {"id": "t", "tagger": "rule", "sentences": self.lines})
        self.labels = self.write_json("a.json", _labels(self.lines, CAST))

    def _plant(self, seed: int) -> tuple[dict, list[dict]]:
        out, listed = self.dir / f"p{seed}.json", self.dir / f"l{seed}.json"
        self.assertEqual(self.run_script("plant_errors.py", self.draft, self.labels, seed, out, listed).returncode, 0)
        return json.loads(out.read_text(encoding="utf-8")), json.loads(listed.read_text(encoding="utf-8"))

    def test_compare_labels_accepts_planted_labels(self) -> None:
        for seed in range(5):
            self._plant(seed)
            result = self.run_script("compare_labels.py", self.draft, self.dir / f"p{seed}.json", self.labels, self.dir / f"j{seed}")
            self.assertEqual(result.returncode, 0, (seed, result.stderr))

    def test_speaker_is_planted_and_style_skips_cast_lines(self) -> None:
        planted, listed = self._plant(1)
        speakers = [item for item in listed if item["field"] == "speaker"]
        self.assertTrue(speakers)
        notes = {item["index"]: item["speaker"] for item in planted["annotations"]}
        self.assertTrue(all(notes[item["index"]] == item["planted"] != item["original"] for item in speakers))
        self.assertTrue(all(STORY[item["index"]][1] is None for item in listed if item["field"] == "style"))
        self.assertTrue(planted["plantedForTest"])


class PlantWithoutPartners(unittest.TestCase):
    def test_single_cast_member_gets_no_speaker_plant(self) -> None:
        current = [{"style": "calm", "speaker": "토토" if i % 2 else "narrator", "emotion": "neutral"} for i in range(10)]
        plants = plan_plants({"cast": [{"name": "토토", "voiceType": "아기"}]}, current, random.Random(1))
        self.assertEqual([item for item in plants if item["field"] == "speaker"], [])


if __name__ == "__main__":
    unittest.main()
