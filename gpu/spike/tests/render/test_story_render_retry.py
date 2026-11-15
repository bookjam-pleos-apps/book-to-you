from pathlib import Path

import numpy as np

from spike.render.attempt.attempt_policy import MAX_ATTEMPTS, SEED_STEP
from spike.sound.audio import Audio
from spike.clone.engine.clone_port import CloneRequest, Synthesis
from spike.story.story_plan import StorySentence
from spike.render.story_render import Reference, RenderSettings, render_sentence

SENTENCE = StorySentence("가나다라", "calm", 500)
SETTINGS = RenderSettings("model", 100, {"calm": Reference(Path("/ref.wav"), "대본")})
ONE_SECOND = Audio(np.ones(24000, dtype=np.float32), 24000)
LONG_TEXT = "옛날 옛적 아주 먼 나라에 마음씨 고운 왕녀님이 살았습니다 어느 날 왕녀님은 숲으로 산책을 나갔습니다 그 공은 금빛이었어요"


class SilentEngine:
    def synthesize(self, _: CloneRequest) -> Synthesis:
        return Synthesis(ONE_SECOND, 1)


def _render(text: str, answers: list[str]):
    heard = iter(answers)
    return render_sentence(StorySentence(text, "calm", 900), SilentEngine(), lambda _: next(heard), SETTINGS)


def test_when_every_attempt_fails_the_least_bad_one_is_kept():
    least_missing = LONG_TEXT.removesuffix("이었어요")
    result = _render(LONG_TEXT, [least_missing, LONG_TEXT.removesuffix(" 그 공은 금빛이었어요"), LONG_TEXT.removesuffix(" 숲으로 산책을 나갔습니다 그 공은 금빛이었어요")])
    assert (result.passed, result.attempts, result.seed, result.transcript) == (False, MAX_ATTEMPTS, SETTINGS.seed, least_missing)


def test_equally_bad_attempts_keep_the_last_one():
    result = render_sentence(SENTENCE, SilentEngine(), lambda _: "전혀 다른 말", SETTINGS)
    assert (result.attempts, result.seed) == (MAX_ATTEMPTS, SETTINGS.seed + (MAX_ATTEMPTS - 1) * SEED_STEP)


def test_later_passing_attempt_replaces_an_earlier_failure():
    result = _render(LONG_TEXT, [LONG_TEXT.removesuffix(" 그 공은 금빛이었어요"), LONG_TEXT])
    assert (result.passed, result.attempts, result.seed) == (True, 2, SETTINGS.seed + SEED_STEP)


def test_dropped_opening_sentence_is_retried_although_cer_passes():
    text = "합니다. 하도 이상하여 웅덩이를 들여다보니까 개구리 한 마리가 보기 싫은 얼굴을 물 위에 내밀고 있었습니다."
    dropped = "하도 이상하여 웅덩이를 들여다보니까 개구리 한 마리가 보기 싫은 얼굴을 물 위에 내밀고 있었습니다."
    result = _render(text, [dropped, text])
    assert (result.attempts, result.passed, result.transcript) == (2, True, text)
