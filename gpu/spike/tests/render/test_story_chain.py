from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
from fakes import PASSAGE_RATE, PASSAGE_SPEECH_SAMPLES, rendered_passage

from spike.render.attempt.attempt_policy import MAX_ATTEMPTS
from spike.sound.audio import Audio
from spike.clone.engine.clone_port import CloneRequest, Synthesis
from spike.render.story_chain import (
    CONTEXT_TAIL_PAD_SEC,
    MAX_CONTEXT_SEC,
    chain_context,
    chained_render,
    decoder_junction_sec,
    decoder_junctions_sec,
    near_decoder_junction,
    next_context,
    one_hop_render,
)
from spike.story.story_plan import StorySentence
from spike.render.story_render import Reference, RenderSettings, independent_render, render_sentence, render_story

SCRIPT = "오오 네가 지금 말하였니 하고 왕녀가 묻고 나서 다시 말하였습니다"
SENTENCE = StorySentence(SCRIPT, "calm", 900)
SETTINGS = RenderSettings("model", 100, {"calm": Reference(Path("/ref.wav"), "대본")})
SILENT_AUDIO = Audio(np.zeros(1000, dtype=np.float32), PASSAGE_RATE)
CONTEXTED = replace(SETTINGS, context=next_context([rendered_passage("앞 묶음 끝에 내밀고 있었습니다")]))
LEAKED = f"있었습니다 {SCRIPT}"


class RecordingEngine:
    def __init__(self):
        self.requests: list[CloneRequest] = []

    def synthesize(self, request: CloneRequest) -> Synthesis:
        self.requests.append(request)
        return Synthesis(rendered_passage().audio, 12, 430)


def _had_context(engine: RecordingEngine) -> list[bool]:
    return [request.context is not None for request in engine.requests]


def _heard(*transcripts: str):
    answers = iter(transcripts)
    return lambda _: next(answers)


def test_junction_lands_where_the_decoder_cuts():
    assert decoder_junction_sec(295) == pytest.approx(0.4)
    assert decoder_junction_sec(204) == pytest.approx(7.68)


def test_prompt_ending_on_a_chunk_edge_puts_the_junction_at_the_very_start():
    assert decoder_junction_sec(600) == 0


def test_long_unit_has_a_junction_every_chunk():
    assert decoder_junctions_sec(205, 33.0) == pytest.approx([7.6, 31.6])


def test_unit_shorter_than_the_first_junction_has_none():
    assert decoder_junctions_sec(205, 5.0) == []


def test_mark_near_a_junction_is_found_from_the_story_start():
    long_audio = Audio(np.zeros(PASSAGE_RATE * 10, dtype=np.float32), PASSAGE_RATE)
    unit = replace(rendered_passage(), audio=long_audio, prompt_codes=205)
    assert near_decoder_junction(107.6, [unit], [100.0])
    assert near_decoder_junction(108.6, [unit], [100.0])
    assert not near_decoder_junction(109.0, [unit], [100.0])
    assert not near_decoder_junction(7.6, [unit], [100.0])


def test_unit_without_prompt_codes_has_no_known_junction():
    assert not near_decoder_junction(0.0, [rendered_passage()], [0.0])


def test_context_keeps_speech_only_and_ends_in_silence():
    context = chain_context(rendered_passage())
    pad = int(PASSAGE_RATE * CONTEXT_TAIL_PAD_SEC)
    assert len(context.audio.samples) == PASSAGE_SPEECH_SAMPLES + pad
    assert np.all(context.audio.samples[PASSAGE_SPEECH_SAMPLES:] == 0)
    assert np.all(context.audio.samples[:PASSAGE_SPEECH_SAMPLES] > 0)
    assert context.text == "앞 묶음"


def test_context_without_speech_stops():
    silent = replace(rendered_passage(), audio=SILENT_AUDIO)
    with pytest.raises(ValueError, match="말소리"):
        chain_context(silent)


def test_first_unit_has_no_context():
    assert next_context([]) is None


def test_passing_unit_becomes_the_next_context():
    context = next_context([rendered_passage("먼저"), rendered_passage("바로 앞")])
    assert context is not None and context.text == "바로 앞"


def test_failed_unit_breaks_the_chain():
    assert next_context([replace(rendered_passage(), passed=False)]) is None


def test_too_long_unit_breaks_the_chain():
    long_audio = Audio(np.full(int(PASSAGE_RATE * (MAX_CONTEXT_SEC + 1)), 0.3, dtype=np.float32), PASSAGE_RATE)
    assert next_context([replace(rendered_passage(), audio=long_audio)]) is None


def test_passing_unit_without_speech_breaks_the_chain_instead_of_stopping_the_render():
    assert next_context([replace(rendered_passage(), audio=SILENT_AUDIO)]) is None


def test_chained_story_passes_each_unit_to_the_next():
    engine = RecordingEngine()
    first, second = StorySentence("가나다라", "calm", 900), StorySentence("마바사아", "calm", 900)
    transcribe = _heard("가나다라", "마바사아")
    rendered = render_story([first, second], chained_render(engine, transcribe, SETTINGS))
    assert _had_context(engine) == [False, True]
    assert engine.requests[1].context.text == "가나다라"
    assert [item.context_used for item in rendered] == [False, True]


def test_independent_story_never_uses_context():
    engine = RecordingEngine()
    render_story([SENTENCE, SENTENCE], independent_render(engine, lambda _: SCRIPT, SETTINGS))
    assert _had_context(engine) == [False, False]


def test_retry_keeps_context_until_the_last_attempt():
    engine = RecordingEngine()
    result = render_sentence(SENTENCE, engine, lambda _: "전혀 다른 말", CONTEXTED)
    assert _had_context(engine) == [True] * (MAX_ATTEMPTS - 1) + [False]
    assert (result.passed, result.context_used) == (False, False)


def test_repeated_previous_script_is_retried():
    engine = RecordingEngine()
    result = render_sentence(SENTENCE, engine, _heard(LEAKED, SCRIPT), CONTEXTED)
    assert (result.attempts, result.passed, result.context_used) == (2, True, True)


def test_last_attempt_is_not_judged_against_context_it_did_not_use():
    result = render_sentence(SENTENCE, RecordingEngine(), lambda _: LEAKED, CONTEXTED)
    assert (result.attempts, result.passed, result.context_used) == (MAX_ATTEMPTS, True, False)


def test_result_keeps_the_engine_measurements():
    result = render_sentence(SENTENCE, RecordingEngine(), lambda _: SCRIPT, SETTINGS)
    assert (result.gen_ms, result.prompt_codes) == (12, 430)


def test_one_hop_takes_context_from_the_other_render_not_from_its_own_output():
    sources = [rendered_passage("다른 렌더 첫 묶음"), rendered_passage("다른 렌더 둘째 묶음"), rendered_passage("다른 렌더 셋째 묶음")]
    engine = RecordingEngine()
    render_one = one_hop_render(engine, lambda _: SCRIPT, SETTINGS, sources)
    render_story([SENTENCE, SENTENCE, SENTENCE], render_one)
    assert [None if request.context is None else request.context.text for request in engine.requests] == [
        None,
        "다른 렌더 첫 묶음",
        "다른 렌더 둘째 묶음",
    ]


def test_one_hop_excerpt_keeps_its_position_in_the_full_plan():
    sources = [rendered_passage("첫 묶음"), rendered_passage("둘째 묶음"), rendered_passage("셋째 묶음")]
    engine = RecordingEngine()
    render_story([SENTENCE], one_hop_render(engine, lambda _: SCRIPT, SETTINGS, sources, first_unit=2))
    assert engine.requests[0].context.text == "둘째 묶음"


def test_sampling_settings_reach_the_engine_on_every_attempt():
    engine = RecordingEngine()
    settings = replace(SETTINGS, repetition_penalty=1.0, subtalker_greedy=True)
    render_sentence(SENTENCE, engine, lambda _: "틀린 전사", settings)
    assert len(engine.requests) == MAX_ATTEMPTS
    assert all(request.repetition_penalty == 1.0 and request.subtalker_greedy for request in engine.requests)
