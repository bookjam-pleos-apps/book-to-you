"""시도 음성을 무엇으로 받아쓸지 정한다. 순수 로직.

30초 이하는 원본 하나를 통째로(`transcribe` 워크플로우와 같음), 30초를 넘으면 Silero VAD 구간마다(`transcribe-long`과 같음),
길이 예산을 넘겼으면 받아쓰지 않는다(Python 렌더와 같음).
구간은 model-compose audio-clipper와 똑같은 ffmpeg 인자로 자른다. `-c copy`라 끝이 패킷 경계에 맞춰지므로
샘플 단위로 자르면 Whisper가 듣는 소리가 달라진다(audio_clipper/drivers/ffmpeg.py, 포크 5bd4e1e6).
"""
from collections.abc import Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class Span:
    start_sec: float
    end_sec: float


@dataclass(frozen=True)
class TranscriptionPlan:
    whole: bool
    spans: tuple[Span, ...]


NOTHING = TranscriptionPlan(whole=False, spans=())
WHOLE = TranscriptionPlan(whole=True, spans=())


def vad_spans(segments: Sequence[Mapping[str, float]]) -> tuple[Span, ...]:
    return tuple(Span(float(segment["start_time"]), float(segment["end_time"])) for segment in segments)


def transcription_plan(hit_budget: bool, is_long: bool, segments: Sequence[Mapping[str, float]]) -> TranscriptionPlan:
    if hit_budget:
        return NOTHING
    if not is_long:
        return WHOLE
    return TranscriptionPlan(whole=False, spans=vad_spans(segments))


def clip_args(source: str, span: Span) -> list[str]:
    """audio-clipper의 명령(-ss, -to를 -i 앞에, -vn -c:a copy)과 같다. 출력은 파일이라 형식만 wav로 정한다."""
    return [
        "-hide_banner", "-ss", f"{span.start_sec:.6f}", "-to", f"{span.end_sec:.6f}",
        "-i", source, "-vn", "-c:a", "copy", "-f", "wav",
    ]
