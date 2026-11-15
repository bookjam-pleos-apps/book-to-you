"""평가 테스트가 같이 쓰는 가짜 구현과 합성 신호."""
import numpy as np

from spike.sound.audio import Audio
from spike.sound.prosody import SEMITONES_PER_OCTAVE
from spike.story.story_plan import StorySentence
from spike.render.story_render import RenderedSentence

SAMPLE_RATE = 16000
TONE_HZ = 220
PASSAGE_RATE = 1000
PASSAGE_SPEECH_SAMPLES = 1000
PASSAGE_EDGE_SAMPLES = 200


def tone(level: float = 0.5, sec: float = 1.0) -> np.ndarray:
    t = np.arange(int(SAMPLE_RATE * sec)) / SAMPLE_RATE
    return (level * np.sin(2 * np.pi * TONE_HZ * t)).astype(np.float32)


def silence(sec: float) -> np.ndarray:
    return np.zeros(int(SAMPLE_RATE * sec), dtype=np.float32)


def tone_audio(level: float = 0.5, sec: float = 1.0) -> Audio:
    return Audio(tone(level, sec), SAMPLE_RATE)


def rendered_passage(text: str = "앞 묶음") -> RenderedSentence:
    """앞뒤 무음 사이에 말소리가 있는 렌더 결과. 문맥으로 쓰는 앞 묶음을 흉내 낸다."""
    edge = np.zeros(PASSAGE_EDGE_SAMPLES, dtype=np.float32)
    speech = np.full(PASSAGE_SPEECH_SAMPLES, 0.3, dtype=np.float32)
    audio = Audio(np.concatenate([edge, speech, edge]), PASSAGE_RATE)
    return RenderedSentence(StorySentence(text, "calm", 900), audio, text, 0.0, 1, True, 1234, None)


class FixedTranscriber:
    """입력과 상관없이 정해진 전사를 돌려준다."""

    def __init__(self, text: str):
        self._text = text

    def transcribe(self, audio: Audio) -> str:
        return self._text


class FixedPitchTracker:
    """입력과 상관없이 정해진 F0 배열을 돌려준다."""

    def __init__(self, f0: np.ndarray):
        self._f0 = f0

    def track(self, audio: Audio) -> np.ndarray:
        return self._f0


def gliding_f0(low_hz: float, high_hz: float, frames: int = 100) -> np.ndarray:
    """반음 단위로 고르게 오르는 F0. p10~p90 폭은 전체 폭의 80%다."""
    semitones = np.linspace(0, SEMITONES_PER_OCTAVE * np.log2(high_hz / low_hz), frames)
    return low_hz * 2 ** (semitones / SEMITONES_PER_OCTAVE)
