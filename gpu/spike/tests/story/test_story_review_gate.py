from spike.story.story_draft import DraftSentence, Suggestion
from spike.story.story_review_gate import cast_problems

CAST = [{"name": "늑대", "voiceType": "아빠", "style": "deep"}, {"name": "토끼", "voiceType": "아기"}]


def _line(speaker: str | None, style: str | None) -> DraftSentence:
    return DraftSentence("말.", 450, Suggestion("calm"), confirmed_style=style, speaker=speaker)


def test_a_cast_character_confirmed_in_another_voice_is_refused():
    problems = cast_problems([_line("늑대", "deep"), _line("늑대", "calm")], CAST)
    assert [problem.split("번")[0] for problem in problems] == ["1"]


def test_narration_characters_without_a_cast_style_and_unreviewed_lines_are_left_to_other_checks():
    assert cast_problems([_line(None, "calm"), _line("토끼", "excited"), _line("늑대", None)], CAST) == []
