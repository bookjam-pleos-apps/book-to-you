from pathlib import Path

import numpy as np
import pytest
from repeat_audio import GAP_SEC, TAKE_SEC, two_takes
from word_audio import HEAD_SEC, head_then_word
from word_transcriber import fake_transcribe

from spike.sound.audio import Audio
from spike.clone.engine.clone_port import CloneRequest, Synthesis
from spike.sound.audio_gaps import KEEP_INTO_GAP_SEC
from spike.render.tail.tail_plan import TailSetting, with_tails
from spike.story.story_plan import StorySentence
from spike.render.story_render import Reference, RenderSettings, render_sentence

RATE = 24000
TITLE = with_tails([StorySentence("빨간 모자", "calm", 900)], TailSetting("repeat", "그래"))[0]
SETTINGS = RenderSettings("model", 100, {"calm": Reference(Path("/ref.wav"), "대본")})


class FixedEngine:
    def __init__(self, samples: np.ndarray):
        self.samples, self.texts = samples, []

    def synthesize(self, request: CloneRequest) -> Synthesis:
        self.texts.append(request.text)
        return Synthesis(Audio(self.samples, RATE), 1)


def test_a_repeated_unit_sends_both_takes_and_keeps_only_the_first():
    engine, heard = FixedEngine(two_takes(RATE)), []

    result = render_sentence(TITLE, engine, lambda audio: heard.append(audio.duration_sec) or "빨간 모자", SETTINGS)

    assert engine.texts == ["빨간 모자. 빨간 모자."]
    assert result.passed
    assert abs(result.audio.duration_sec - (TAKE_SEC + KEEP_INTO_GAP_SEC)) < 0.02
    assert heard == [result.audio.duration_sec]
    assert result.audio.duration_sec < TAKE_SEC + GAP_SEC
    assert result.head_share == pytest.approx(result.audio.duration_sec / (2 * TAKE_SEC + GAP_SEC), abs=0.01)


def test_a_take_that_cannot_be_cut_fails_without_transcription():
    engine, heard = FixedEngine(np.full(RATE * 2, 0.1, dtype=np.float32)), []

    result = render_sentence(TITLE, engine, lambda audio: heard.append(audio) or "빨간 모자", SETTINGS)

    assert (result.passed, result.transcript, heard) == (False, "", [])


def test_a_word_tail_unit_sends_the_word_and_keeps_the_part_before_it():
    title = with_tails([StorySentence("빨간 모자", "calm", 900)], TailSetting("word", "그래"))[0]
    engine, heard = FixedEngine(head_then_word()), []

    result = render_sentence(title, engine, lambda audio: heard.append(audio.duration_sec) or fake_transcribe(audio), SETTINGS)

    assert engine.texts == ["빨간 모자. 그래."]
    assert result.passed and result.head_share is None
    assert abs(result.audio.duration_sec - (HEAD_SEC + KEEP_INTO_GAP_SEC)) < 0.02
    assert len(heard) == 3, "생성음 전체와 후보 앞부분 둘만 받아쓰고, 고른 앞부분을 다시 받아쓰지 않는다"
