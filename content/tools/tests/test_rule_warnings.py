"""문장으로만 있던 구연 규칙의 경고 시험."""

import unittest

from helpers import sentences

from decision_candidates import candidate_table, mismatches
from rule_warnings import animal_tails, long_sentences, rule_warnings, same_sound_partners, soft_on_speakers


def _story(*rows: tuple[str, str, str]) -> list[dict]:
    """(문장, 화자, 녹음)."""
    lines = sentences(*[text for text, _, _ in rows])
    return [{**line, "speaker": speaker, "suggestedStyle": style, "emotion": "neutral"} for line, (_, speaker, style) in zip(lines, rows)]


class LongSentence(unittest.TestCase):
    def test_over_45_syllables_is_warned(self) -> None:
        lines = _story(("가" * 46 + ".", "narrator", "calm"))
        self.assertEqual([item["from"] for item in long_sentences(lines)], [0])

    def test_45_syllables_is_not_warned(self) -> None:
        self.assertEqual(long_sentences(_story(("가" * 45 + ".", "narrator", "calm"))), [])


class SameSoundPartners(unittest.TestCase):
    def test_two_speakers_in_a_row_with_the_same_recording(self) -> None:
        lines = _story(("“어디 가니?”", "늑대", "calm"), ("“할머니 댁에요.”", "빨간 모자", "calm"))
        self.assertEqual([(item["from"], item["to"]) for item in same_sound_partners(lines)], [(0, 1)])

    def test_different_recordings_narration_between_or_same_speaker_pass(self) -> None:
        apart = _story(("“어디 가니?”", "늑대", "deep"), ("“할머니 댁에요.”", "빨간 모자", "child"))
        narrated = _story(("“어디 가니?”", "늑대", "calm"), ("늑대가 물었어요.", "narrator", "calm"), ("“댁에요.”", "빨간 모자", "calm"))
        alone = _story(("“어디 가니?”", "늑대", "calm"), ("“대답해.”", "늑대", "calm"))
        self.assertEqual([same_sound_partners(lines) for lines in (apart, narrated, alone)], [[], [], []])


class SoftOnSpeakers(unittest.TestCase):
    def setUp(self) -> None:
        self.lines = _story(("“아이고.”", "할머니", "soft"), ("“흑.”", "콩이", "soft"), ("“가자.”", "콩이", "calm"), ("“와.”", "토토", "calm"))

    def test_half_or_more_soft_lines_are_warned(self) -> None:
        warned = soft_on_speakers(self.lines, [])
        self.assertEqual(sorted(item["note"].split("의")[0] for item in warned), ["콩이", "할머니"])

    def test_cast_soft_speaker_is_allowed(self) -> None:
        warned = soft_on_speakers(self.lines, [{"name": "할머니", "voiceType": "할머니", "style": "soft"}])
        self.assertEqual([item["from"] for item in warned], [1])

    def test_under_half_is_not_warned(self) -> None:
        lines = _story(("“흑.”", "콩이", "soft"), ("“가자.”", "콩이", "calm"), ("“응.”", "콩이", "calm"))
        self.assertEqual(soft_on_speakers(lines, []), [])


class AnimalTails(unittest.TestCase):
    def test_sound_after_words_at_the_end_of_dialogue(self) -> None:
        lines = _story(("“여기 있을게, 멍멍.”", "멍멍이", "calm"), ("“그래, 야옹야옹!” 고양이가 말했어요.", "고양이", "calm"))
        self.assertEqual([item["from"] for item in animal_tails(lines)], [0, 1])

    def test_sound_alone_in_narration_or_mid_sentence_passes(self) -> None:
        lines = _story(("“멍멍!”", "멍멍이", "calm"), ("강아지가 멍멍.", "narrator", "calm"), ("“멍멍 짖지 마.”", "토토", "calm"))
        self.assertEqual(animal_tails(lines), [])


class CandidateTable(unittest.TestCase):
    def test_rule_checks_ride_beside_rows(self) -> None:
        lines = _story(("가" * 50 + ".", "narrator", "calm"), ("“좋아!”", "콩이", "soft"))
        table = candidate_table({"id": "t", "sentences": lines, "cast": []}, limit=1)
        self.assertEqual(table["ruleChecks"], rule_warnings({"sentences": lines}))
        self.assertEqual([item["kind"] for item in table["ruleChecks"]], ["긴 문장", "대사 많은 인물에 soft"])

    def test_soft_with_joy_or_anger_is_a_mismatch(self) -> None:
        lines = [{**line, "emotion": emotion} for line, emotion in zip(_story(*[("“아.”", "콩이", "soft")] * 3), ("joy", "anger", "sadness"))]
        self.assertEqual([row["from"] for row in mismatches(lines)], [0, 1])


if __name__ == "__main__":
    unittest.main()
