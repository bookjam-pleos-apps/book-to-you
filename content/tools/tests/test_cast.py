"""인물 녹음(cast style)이 확정까지 깨지지 않는지."""

import unittest

from helpers import sentences
from finalize_draft import cast_breaks


def _document() -> dict:
    lines = [{**line, "speaker": speaker} for line, speaker in zip(sentences("“어흥.”", "서술.", "“살려 줘!”"), ("늑대", "narrator", "토끼"))]
    return {"cast": [{"name": "늑대", "voiceType": "아빠", "style": "deep"}, {"name": "토끼", "voiceType": "아기"}], "sentences": lines}


class CastOnFinalize(unittest.TestCase):
    def test_a_human_override_cannot_give_a_cast_character_a_second_voice(self) -> None:
        problems = cast_breaks(_document(), {0: "calm"})
        self.assertEqual(len(problems), 1)
        self.assertIn("늑대", problems[0])

    def test_overrides_for_narration_or_characters_without_a_cast_style_pass(self) -> None:
        self.assertEqual(cast_breaks(_document(), {1: "soft", 2: "excited"}), [])


if __name__ == "__main__":
    unittest.main()
