from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest

from spike.render.attempt.attempt_policy import MAX_ATTEMPTS, SEED_STEP
from spike.sound.audio import Audio
from spike.sound.audio_level import MAX_PEAK, leveled
from spike.clone.engine.clone_port import CloneRequest, Synthesis
from spike.story.story_plan import (
    MAX_PASSAGE_SYLLABLES,
    PARAGRAPH_PAUSE_MS,
    SENTENCE_PAUSE_MS,
    StorySentence,
    excerpt,
    merge_passages,
    plan_story,
    plan_units,
    split_sentences,
)
from spike.render.story_render import (
    Reference,
    RenderedSentence,
    RenderSettings,
    independent_render,
    render_sentence,
    render_story,
    stitch,
    story_sample_count,
)

SENTENCE = StorySentence("가나다라", "calm", 500)
SETTINGS = RenderSettings("model", 100, {"calm": Reference(Path("/ref.wav"), "대본")})
ONE_SECOND = Audio(np.ones(24000, dtype=np.float32), 24000)


class RecordingEngine:
    def __init__(self):
        self.seeds = []

    def synthesize(self, request: CloneRequest) -> Synthesis:
        self.seeds.append(request.seed)
        return Synthesis(ONE_SECOND, 1)


def test_split_keeps_sentence_marks_and_quotes():
    assert split_sentences("토끼가 왔어요. “정말?” 하고 물었어요!") == ["토끼가 왔어요.", "“정말?”", "하고 물었어요!"]


def test_story_plan_pauses_longer_between_paragraphs():
    plan = plan_story("하나. 둘.\n\n셋.")
    assert [s.pause_after_ms for s in plan] == [SENTENCE_PAUSE_MS, PARAGRAPH_PAUSE_MS, PARAGRAPH_PAUSE_MS]


def test_only_exclaiming_dialogue_is_excited():
    plan = plan_story("“정말이야!”\n\n“그렇구나.”\n\n와, 놀랐어요!")
    assert [s.style for s in plan] == ["excited", "calm", "calm"]


def test_passing_sentence_uses_one_attempt():
    engine = RecordingEngine()
    result = render_sentence(SENTENCE, engine, lambda _: "가나다라", SETTINGS)
    assert (result.attempts, result.passed, engine.seeds) == (1, True, [100])


def test_failing_sentence_retries_with_new_seeds_then_reports_failure():
    engine = RecordingEngine()
    result = render_sentence(SENTENCE, engine, lambda _: "전혀 다른 말", SETTINGS)
    assert (result.attempts, result.passed) == (MAX_ATTEMPTS, False)
    assert len(set(engine.seeds)) == MAX_ATTEMPTS


def test_units_generate_at_the_requested_size():
    body = "하나. 둘.\n\n“셋!”"
    assert [s.text for s in plan_units(body, "sentence", None)] == ["하나.", "둘.", "“셋!”"]
    assert [s.text for s in plan_units(body, "paragraph", None)] == ["하나. 둘.", "“셋!”"]
    assert [s.text for s in plan_units(body, "whole", None)] == ["하나. 둘. “셋!”"]


LONG_LINE = "옛날 옛적 아주 먼 나라에 마음씨 고운 임금님이 살았는데 모두가 그 임금님을 좋아했습니다."


def test_passage_joins_a_clause_ending_with_a_comma():
    assert merge_passages([f"{LONG_LINE} 생각하였으나,", "“그래 줄게.”"]) == [f"{LONG_LINE} 생각하였으나, “그래 줄게.”"]


def test_passage_joins_a_dialogue_tail():
    assert merge_passages([f"“{LONG_LINE}”", "합니다."]) == [f"“{LONG_LINE}” 합니다."]


def test_passage_joins_a_too_short_unit():
    assert merge_passages(["“무엇?”", LONG_LINE]) == [f"“무엇?” {LONG_LINE}"]


def test_passage_keeps_independent_paragraphs_apart():
    assert merge_passages([LONG_LINE, LONG_LINE]) == [LONG_LINE, LONG_LINE]


def test_passage_never_grows_past_the_limit():
    huge = "가" * MAX_PASSAGE_SYLLABLES
    assert merge_passages([huge, "합니다."]) == [huge, "합니다."]


def test_single_style_overrides_every_unit():
    assert {s.style for s in plan_units("“정말!”\n\n그렇구나.", "sentence", "calm")} == {"calm"}


def test_leveling_brings_quiet_and_loud_sentences_together():
    quiet = leveled(np.full(1000, 0.02, dtype=np.float32))
    loud = leveled(np.full(1000, 0.4, dtype=np.float32))
    assert abs(float(quiet[0]) - float(loud[0])) < 1e-3


def test_leveling_never_exceeds_the_peak_limit():
    spiky = np.concatenate([np.full(1000, 0.02, dtype=np.float32), np.array([0.9], dtype=np.float32)])
    assert np.abs(leveled(spiky)).max() <= MAX_PEAK + 1e-6


def test_leveling_leaves_silence_unchanged():
    silence = np.zeros(100, dtype=np.float32)
    assert np.array_equal(leveled(silence), silence)


def test_temperature_reaches_the_engine_and_the_result():
    class TemperatureEngine(RecordingEngine):
        def synthesize(self, request: CloneRequest) -> Synthesis:
            self.temperature = request.temperature
            return super().synthesize(request)

    engine = TemperatureEngine()
    result = render_sentence(SENTENCE, engine, lambda _: "가나다라", replace(SETTINGS, temperature=0.5))
    assert (engine.temperature, result.temperature) == (0.5, 0.5)


def test_default_temperature_leaves_the_engine_default():
    assert render_sentence(SENTENCE, RecordingEngine(), lambda _: "가나다라", SETTINGS).temperature is None


def test_result_records_the_seed_that_produced_it():
    answers = iter(["전혀 다른 말", "가나다라"])
    result = render_sentence(SENTENCE, RecordingEngine(), lambda _: next(answers), SETTINGS)
    assert result.seed == SETTINGS.seed + SEED_STEP


def test_progress_is_reported_after_every_unit():
    seen = []
    rendered = render_story(
        [SENTENCE, SENTENCE],
        independent_render(RecordingEngine(), lambda _: "가나다라", SETTINGS),
        lambda done: seen.append(len(done)),
    )
    assert (seen, len(rendered)) == ([1, 2], 2)


UNITS = [StorySentence(str(index), "calm", 0) for index in range(5)]


def test_excerpt_is_a_slice_of_the_full_plan():
    assert excerpt(UNITS, 1, 2) == UNITS[1:3]
    assert excerpt(UNITS, 3, None) == UNITS[3:]
    assert excerpt(UNITS, 0, None) == UNITS


def test_excerpt_of_a_merged_plan_keeps_passage_boundaries():
    body = f"{LONG_LINE}\n\n“{LONG_LINE}”\n\n합니다.\n\n{LONG_LINE}"
    full = plan_units(body, "passage", "calm")
    assert [unit.text for unit in excerpt(full, 1, 2)] == [f"“{LONG_LINE}” 합니다.", LONG_LINE]


@pytest.mark.parametrize(("first", "count"), [(0, 6), (5, None), (-1, 1), (1, 0)])
def test_excerpt_rejects_a_range_outside_the_plan(first, count):
    with pytest.raises(ValueError):
        excerpt(UNITS, first, count)


def test_stitch_adds_each_pause():
    rendered = render_sentence(SENTENCE, RecordingEngine(), lambda _: "가나다라", SETTINGS)
    story = stitch([rendered, rendered])
    assert len(story.samples) == 2 * (24000 + 12000)


def test_sample_count_matches_the_stitched_story():
    rendered = RenderedSentence(SENTENCE, ONE_SECOND, "가나다라", 0.0, 1, True, 100, None)
    assert story_sample_count([rendered, rendered]) == len(stitch([rendered, rendered], "none").samples)
