"""복원과 라벨 검증 시험. 사용: python3 -m unittest discover -s <skill>/tests"""

import unittest

from helpers import labels_for, sentences

from check_quotes import restoration_problems
from compare_restore import differences
from decision_candidates import changes_sound, long_runs, style_runs
from finalize_draft import parse_override
from label_rules import label_problems, label_values


class Restoration(unittest.TestCase):
    def test_changed_spacing_is_refused(self) -> None:
        self.assertTrue(restoration_problems("아버지가 방에 갔다.\n", "아버지 가방에 갔다.\n"))

    def test_straight_quote_is_refused(self) -> None:
        self.assertTrue(restoration_problems("엄마s 집\n", "엄마's 집\n"))

    def test_wrapped_source_is_refused(self) -> None:
        self.assertTrue(restoration_problems("가나\n다라\n", "가나 다라\n"))

    def test_nested_quotes_are_accepted(self) -> None:
        self.assertEqual(restoration_problems("엄마가 토토 안녕 했다.\n", "“엄마가 ‘토토 안녕’ 했다.”\n"), [])

    def test_removing_a_word_apostrophe_is_refused(self) -> None:
        self.assertTrue(restoration_problems("엄마's 집\n", "엄마s 집\n"))

    def test_empty_is_refused(self) -> None:
        self.assertTrue(restoration_problems("", ""))

    def test_compare_sees_kind_pair_and_sentence_boundary(self) -> None:
        lines = sentences("“가자.”", "서술.")
        joined = sentences("‘가자.’ 서술.")
        kinds = {item["kind"] for item in differences("“가자.”\n서술.\n", "‘가자.’ 서술.\n", lines, joined)}
        self.assertEqual(kinds, {"대사 범위", "문장 경계"})
        same = sentences("“가자.” “싫어.”")
        self.assertEqual([item["kind"] for item in differences("“가자.” “싫어.”\n", "“가자. 싫어.”\n", same, same)], ["대사 쌍의 경계"])

    def test_line_breaks_that_do_not_change_sentences_are_not_reported(self) -> None:
        lines = sentences("가나. 다라.")
        self.assertEqual(differences("가나.\n다라.\n", "가나. 다라.\n", lines, lines), [])

    def test_span_with_mixed_values_is_split_so_options_are_true(self) -> None:
        lines = sentences("x")
        items = differences("“안녕” 콩이가\n", "안녕 “콩이가”\n", lines, lines)
        self.assertEqual(
            [(item["first"], item["review"]) for item in items if item["kind"] == "대사 범위"],
            [("소리 낸 말", "서술"), ("서술", "소리 낸 말")],
        )


class Labels(unittest.TestCase):
    def test_changed_sentence_breaks_the_hash(self) -> None:
        labels = labels_for(sentences("하나.", "둘."))
        self.assertIn("draftHash", label_problems(labels, sentences("하나.", "셋."))[0])

    def test_typo_key_is_refused(self) -> None:
        lines = sentences("하나.")
        self.assertTrue(label_problems(labels_for(lines, exicted=[]), lines))

    def test_bad_entries_are_refused(self) -> None:
        lines = sentences("하나.", "둘.")
        for bad in (
            {"excited": [{"index": 1.5, "reason": "x"}]},
            {"excited": [{"index": True, "reason": "x"}]},
            {"excited": [{"index": 0, "reason": "x"}, {"index": 0, "reason": "y"}]},
            {"excited": [{"index": 0}]},
            {"annotations": [{"index": 0, "emotion": "joy"}]},
            {"annotations": [{"index": 0, "speaker": "토토", "emotion": "joy"}]},
        ):
            self.assertTrue(label_problems(labels_for(lines, **bad), lines), bad)

    def test_wrong_shapes_are_reported_not_raised(self) -> None:
        lines = sentences("하나.")
        for bad in (
            {"excited": None},
            {"annotations": {"index": 0}},
            {"annotations": [{"index": 0, "speaker": ["토토"], "emotion": "joy"}]},
            {"cast": None},
            {"scenes": None},
        ):
            self.assertTrue(label_problems({**labels_for(lines), **bad}, lines), bad)

    def test_scene_map_must_cover_the_story(self) -> None:
        lines = sentences("하나.", "둘.")
        self.assertTrue(label_problems({**labels_for(lines), "scenes": [{"from": 0, "to": 0, "summary": "x"}]}, lines))
        self.assertTrue(
            label_problems(
                {**labels_for(lines), "scenes": [{"from": 0, "to": 1, "summary": "x"}, {"from": 2, "to": 1, "summary": "y"}]}, lines
            )
        )

    def test_valid_labels_pass(self) -> None:
        lines = sentences("하나.", "둘.")
        labels = labels_for(
            lines,
            cast=[{"name": "토토", "voiceType": "아기"}],
            excited=[{"index": 1, "reason": "기쁨"}],
            annotations=[{"index": 1, "speaker": "토토", "emotion": "joy"}],
        )
        self.assertEqual(label_problems(labels, lines), [])
        self.assertEqual(label_values(labels, 2)[1], {"style": "excited", "speaker": "토토", "emotion": "joy"})

    def test_cast_style_reads_every_line_of_that_character(self) -> None:
        lines = sentences("하나.", "“둘.”", "“셋.”")
        notes = [{"index": i, "speaker": "토토", "emotion": "neutral"} for i in (1, 2)]
        labels = labels_for(lines, cast=[{"name": "토토", "voiceType": "아기", "style": "excited"}], annotations=notes)
        self.assertEqual(label_problems(labels, lines), [])
        self.assertEqual([value["style"] for value in label_values(labels, 3)], ["calm", "excited", "excited"])

    def test_a_line_against_the_character_style_is_refused(self) -> None:
        lines = sentences("“하나.”")
        labels = labels_for(
            lines,
            cast=[{"name": "토토", "voiceType": "아기", "style": "calm"}],
            soft=[{"index": 0, "reason": "슬픔"}],
            annotations=[{"index": 0, "speaker": "토토", "emotion": "sadness"}],
        )
        self.assertIn("cast에서 calm", label_problems(labels, lines)[0])

    def test_dialogue_without_a_speaker_is_refused_once_cast_styles_exist(self) -> None:
        lines = sentences("“흥!”", "서술.")
        cast = [{"name": "토토", "voiceType": "아기", "style": "excited"}]
        self.assertIn("화자가 없습니다", label_problems(labels_for(lines, cast=cast), lines)[0])
        named = labels_for(lines, cast=cast, annotations=[{"index": 0, "speaker": "토토", "emotion": "anger"}])
        self.assertEqual(label_problems(named, lines), [])
        self.assertEqual(label_problems(labels_for(lines, cast=[{"name": "토토", "voiceType": "아기"}]), lines), [])

    def test_dialogue_with_a_speech_tail_needs_a_speaker_too(self) -> None:
        lines = sentences("“어흥!” 늑대가 말했어요.", "서술.")
        cast = [{"name": "늑대", "voiceType": "아빠", "style": "deep"}]
        self.assertIn("0번", label_problems(labels_for(lines, cast=cast), lines)[0])
        named = labels_for(lines, cast=cast, annotations=[{"index": 0, "speaker": "늑대", "emotion": "tension"}])
        self.assertEqual(label_problems(named, lines), [])

    def test_deep_is_given_to_a_character_through_cast(self) -> None:
        lines = sentences("서술.", "“어흥.”")
        cast = [{"name": "늑대", "voiceType": "아빠", "style": "deep"}]
        labels = labels_for(lines, cast=cast, annotations=[{"index": 1, "speaker": "늑대", "emotion": "tension"}])
        self.assertEqual(label_problems(labels, lines), [])
        self.assertEqual([value["style"] for value in label_values(labels, 2)], ["calm", "deep"])

    def test_child_is_given_to_a_character_through_cast(self) -> None:
        lines = sentences("서술.", "“할머니!”")
        cast = [{"name": "빨간 모자", "voiceType": "아기", "style": "child"}]
        labels = labels_for(lines, cast=cast, annotations=[{"index": 1, "speaker": "빨간 모자", "emotion": "joy"}])
        self.assertEqual(label_problems(labels, lines), [])
        self.assertEqual([value["style"] for value in label_values(labels, 2)], ["calm", "child"])

    def test_deep_is_not_a_sentence_label(self) -> None:
        lines = sentences("서술.")
        self.assertIn("알 수 없는 키", label_problems(labels_for(lines, deep=[{"index": 0, "reason": "굵게"}]), lines)[0])

    def test_a_reviewer_cannot_set_deep_on_a_sentence(self) -> None:
        self.assertEqual(parse_override("1-2=excited", 3), {1: "excited", 2: "excited"})
        with self.assertRaises(SystemExit):
            parse_override("1=deep", 3)
        with self.assertRaises(SystemExit):
            parse_override("1=child", 3)

    def test_unknown_cast_style_is_refused(self) -> None:
        lines = sentences("하나.")
        self.assertTrue(label_problems(labels_for(lines, cast=[{"name": "토토", "voiceType": "아기", "style": "whisper"}]), lines))


class SoftIsAsked(unittest.TestCase):
    """soft는 soft 녹음으로 읽어 calm과 소리가 다르다."""

    def test_soft_against_calm_reaches_a_person(self) -> None:
        self.assertTrue(changes_sound({"field": "style", "first": "calm", "review": "soft"}))
        self.assertTrue(changes_sound({"field": "style", "first": "excited", "review": "soft"}))

    def test_a_long_soft_run_is_asked(self) -> None:
        lines = [{**line, "suggestedStyle": "soft", "emotion": "sadness"} for line in sentences("가.", "나.", "다.", "라.", "마.")]
        self.assertEqual(len(long_runs(style_runs(lines))), 1)


if __name__ == "__main__":
    unittest.main()
