from pathlib import Path

import numpy as np

from spike.render.attempt.attempt_policy import MAX_ATTEMPTS
from spike.sound.audio import Audio
from spike.clone.engine.clone_port import CloneRequest, Synthesis
from spike.story.story_plan import StorySentence
from spike.render.story_render import Reference, RenderSettings, render_sentence

SAMPLE_RATE = 24000
SENTENCE = StorySentence("가나다라", "calm", 0)
SETTINGS = RenderSettings("model", 100, {"calm": Reference(Path("refs/calm.wav"), "대본")})


class RunawayEngine:
    def __init__(self):
        self.seeds = []

    def synthesize(self, request: CloneRequest) -> Synthesis:
        self.seeds.append(request.seed)
        return Synthesis(Audio(np.ones(SAMPLE_RATE * 40, dtype=np.float32), SAMPLE_RATE), 1)


def refuse_long_audio(_: Audio) -> str:
    raise AssertionError("폭주한 출력은 전사하면 안 된다")


def test_runaway_output_retries_without_asking_the_transcriber():
    engine = RunawayEngine()

    result = render_sentence(SENTENCE, engine, refuse_long_audio, SETTINGS)

    assert (result.attempts, result.passed, result.transcript, result.cer) == (MAX_ATTEMPTS, False, "", 1.0)
    assert len(set(engine.seeds)) == MAX_ATTEMPTS
