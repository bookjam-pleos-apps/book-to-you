"""Whisper가 한 번에 듣는 창과, 창을 넘는 입력을 구간별로 받아쓴 결과를 잇는 규칙. torch를 끌어오지 않는다.

직접 호출과 compose 받아쓰기가 같은 판정으로 긴 입력을 가르고, 렌더 QC와 동등성 측정이 같은 방식으로 구간을 잇는다.
"""
from collections.abc import Iterable

from spike.sound.audio import Audio

WHISPER_WINDOW_SEC = 30


def exceeds_whisper_window(audio: Audio) -> bool:
    return len(audio.samples) > audio.sample_rate * WHISPER_WINDOW_SEC


def cleaned_segments(items: Iterable[object]) -> list[str]:
    """구간마다 받은 받아쓰기의 앞뒤 공백을 지우고 빈 구간은 버린다."""
    return [text for text in (str(item).strip() for item in items) if text]


def join_segments(segments: Iterable[str]) -> str:
    return " ".join(segments)
