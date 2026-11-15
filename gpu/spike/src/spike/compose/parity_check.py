"""직접 호출과 compose 결과를 비교한다. torch와 HTTP를 모르는 순수 로직이다."""
from collections.abc import Iterable
from dataclasses import dataclass

import numpy as np

from spike.sound.audio import PCM16_SCALE, Audio
from spike.clone.budget import count_syllables
from spike.clone.scoring.eval_metrics import cer

PCM16_MIN = -32768
PCM16_MAX = 32767


@dataclass(frozen=True)
class ClipMetrics:
    duration_sec: float
    syllables_per_sec: float
    cer: float


@dataclass(frozen=True)
class ParityLimits:
    max_duration_gap: float = 0.05
    max_cer_gap: float = 0.02
    max_mean_speed_gap: float = 0.03


def clip_metrics(audio: Audio, text: str, transcript: str) -> ClipMetrics:
    duration_sec = audio.duration_sec
    if duration_sec == 0:
        raise ValueError(f"빈 오디오는 비교할 수 없습니다: {text}")
    return ClipMetrics(duration_sec, count_syllables(text) / duration_sec, cer(text, transcript))


def pcm16(samples: np.ndarray) -> np.ndarray:
    """서비스의 PCM 인코더와 같은 변환이다. 직접 호출의 float 결과를 같은 격자로 옮겨야 샘플을 비교할 수 있다."""
    scaled = np.clip(samples, -1.0, 1.0) * PCM16_SCALE
    return np.clip(scaled, PCM16_MIN, PCM16_MAX).astype(np.int16)


def same_pcm16(first: Audio, second: Audio) -> bool:
    return first.sample_rate == second.sample_rate and np.array_equal(pcm16(first.samples), pcm16(second.samples))


def mean_speed_gap(direct: list[ClipMetrics], compose: list[ClipMetrics]) -> float:
    """말 속도 가속은 문장 하나보다 평균에서 드러난다. 직접 호출 대비 비율로 돌려준다."""
    direct_mean = float(np.mean([clip.syllables_per_sec for clip in direct]))
    compose_mean = float(np.mean([clip.syllables_per_sec for clip in compose]))
    return abs(compose_mean - direct_mean) / direct_mean


def limit_violations(direct: ClipMetrics, compose: ClipMetrics, limits: ParityLimits) -> list[str]:
    """동등성을 보므로 compose가 더 나은 쪽으로 달라져도 위반이다."""
    duration_gap = abs(compose.duration_sec - direct.duration_sec) / direct.duration_sec
    checks = (
        ("duration", duration_gap > limits.max_duration_gap),
        ("cer", abs(compose.cer - direct.cer) > limits.max_cer_gap),
    )
    return [name for name, exceeded in checks if exceeded]


def transcriber_violations(direct: ClipMetrics, by_compose_transcriber: ClipMetrics, limits: ParityLimits) -> list[str]:
    """같은 오디오를 compose Whisper로 전사한 지표를 받는다. 전사가 틀려도 클론 비교는 직접 호출 전사로 재서 드러나지 않는다."""
    return [f"transcriber_{name}" for name in limit_violations(direct, by_compose_transcriber, limits)]


def parity_passed(
    reference_matches: Iterable[bool],
    clip_violations: Iterable[list[str]],
    speed_gap: float,
    limits: ParityLimits,
) -> bool:
    return all(reference_matches) and not any(clip_violations) and speed_gap <= limits.max_mean_speed_gap


def unknown_ids(wanted: Iterable[str], known: Iterable[str]) -> list[str]:
    return sorted(set(wanted) - set(known))
