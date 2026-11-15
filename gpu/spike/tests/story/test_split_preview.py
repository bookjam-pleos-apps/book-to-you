from spike.story.split_preview import alone_in_paragraph, preview_split
from spike.story.story_draft import LONG_TAIL_NOTE
from spike.story.story_plan import PARAGRAPH_PAUSE_MS, SENTENCE_PAUSE_MS, StorySentence
from spike.story.story_split import split_story
from spike.story.story_units import UnitLimits, group_units

STORY = "“안녕!” 토끼가 말했어요.\n숲은 조용했어요. 바람이 불었어요.\n\n“같이 가자!”\n여우가 웃었어요.\n"
WITH_SOLO = "“안녕!” 토끼가 말했어요.\n\n“같이 가자!”\n\n여우가 웃으며 숲으로 걸어갔어요. 바람이 불었어요.\n"


def test_preview_matches_the_splitter_in_order_and_count():
    preview = preview_split(STORY)
    assert [line.text for line in preview.sentences] == [slot.text for slot in split_story(STORY)]
    assert [line.index for line in preview.sentences] == list(range(len(preview.sentences)))


def test_preview_carries_pauses_and_syllables():
    first, second, third = preview_split(STORY).sentences[:3]
    assert (first.pause_after_ms, second.pause_after_ms, third.pause_after_ms) == (
        SENTENCE_PAUSE_MS,
        SENTENCE_PAUSE_MS,
        PARAGRAPH_PAUSE_MS,
    )
    assert first.syllables == 9


def test_unbalanced_quotes_come_back_as_an_error_value():
    preview = preview_split("“안녕! 토끼가 말했어요.")
    assert preview.sentences == ()
    assert preview.error and "닫히지 않은 따옴표" in preview.error


def test_long_narration_after_dialogue_keeps_the_draft_note():
    line = preview_split("“안녕!” 토끼가 숲속 깊은 곳에서 아주 오랫동안 친구를 기다리며 말했어요.").sentences[0]
    assert LONG_TAIL_NOTE in line.notes


def test_short_unit_note_needs_a_given_minimum():
    assert all(not line.notes for line in preview_split(WITH_SOLO).sentences)
    noted = [line.index for line in preview_split(WITH_SOLO, min_syllables=30).sentences if line.notes]
    assert noted == [0, 1]


def test_sentences_noted_alone_stay_alone_whatever_the_labels():
    """라벨이 모두 같고 길이 제한이 없으면 묶일 수 있는 문장은 모두 묶인다. 그래도 혼자 남는 것이 알린 문장이다."""
    slots = split_story(WITH_SOLO)
    alone = [slots[index].text for index in range(len(slots)) if alone_in_paragraph(slots, index)]
    units = group_units([StorySentence(slot.text, "calm", slot.pause_after_ms) for slot in slots], UnitLimits(10_000, 0))
    single = [unit.text for unit in units if unit.text in {slot.text for slot in slots}]
    assert alone == single == ["“안녕!” 토끼가 말했어요.", "“같이 가자!”"]


def test_plain_manuscript_is_warned_but_still_split():
    preview = preview_split("토끼가 말했어요. 숲은 조용했어요.")
    assert len(preview.sentences) == 2
    assert any("따옴표" in warning for warning in preview.warnings)
