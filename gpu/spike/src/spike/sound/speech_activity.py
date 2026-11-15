"""클립에서 말소리 프레임을 찾는다. 무음 기준은 클립마다 잡음 바닥에서 정한다. 순수 함수."""
from itertools import groupby

import numpy as np

from spike.sound.audio import Audio

FRAME_SEC = 0.02
DIGITAL_SILENCE_DB = -120.0
DIGITAL_SILENCE_AMPLITUDE = 10 ** (DIGITAL_SILENCE_DB / 20)
NOISE_FLOOR_PERCENTILE = 10
FLOOR_MARGIN_DB = 12.0
PEAK_RANGE_DB = 40.0
PEAK_CAP_DB = 6.0


def voiced_duration(audio: Audio) -> float:
    """앞뒤 무음을 뺀 길이. 무음 길이가 말속도를 왜곡하지 않게 한다."""
    return _speech_span(voiced_frames(audio)).size * _frame_sec(audio)


def longest_gap_sec(audio: Audio) -> float:
    """말 사이 가장 긴 멈춤. 한 번의 긴 멈춤은 무음 비율로 평균을 내면 묻힌다."""
    quiet_runs = (sum(1 for _ in run) for voiced, run in groupby(_speech_span(voiced_frames(audio))) if not voiced)
    return max(quiet_runs, default=0) * _frame_sec(audio)


def speech_bounds(audio: Audio) -> tuple[int, int] | None:
    """첫 말소리와 마지막 말소리의 샘플 위치. 말소리가 없으면 None이다."""
    on = np.flatnonzero(voiced_frames(audio))
    if on.size == 0:
        return None
    frame = _frame_size(audio)
    return int(on[0]) * frame, (int(on[-1]) + 1) * frame


def speech_only(audio: Audio) -> Audio:
    """앞뒤 무음을 걷어낸 말소리 구간. 말소리가 없으면 그대로 둔다."""
    bounds = speech_bounds(audio)
    if bounds is None:
        return audio
    return Audio(audio.samples[bounds[0]:bounds[1]], audio.sample_rate)


def voiced_frames(audio: Audio) -> np.ndarray:
    levels = frame_levels_db(audio)
    if levels.size == 0 or levels.max() <= DIGITAL_SILENCE_DB:
        return np.zeros(levels.size, dtype=bool)
    return levels > voice_threshold_db(levels)


def voice_threshold_db(levels: np.ndarray) -> float:
    """잡음 바닥보다 12dB 위. 고정 기준은 조용한 녹음을 전부 무음으로, 시끄러운 방을 전부 말소리로 읽는다.

    하한(피크-40dB)은 깨끗한 클립에서 숨소리를 말소리로 세지 않게 하고,
    상한(피크-6dB)은 멈춤이 없는 클립의 바닥이 피크와 같아도 말소리로 남게 한다.
    """
    peak = float(levels.max())
    floor = float(np.percentile(levels, NOISE_FLOOR_PERCENTILE))
    return float(np.clip(floor + FLOOR_MARGIN_DB, peak - PEAK_RANGE_DB, peak - PEAK_CAP_DB))


def frame_levels_db(audio: Audio) -> np.ndarray:
    frame = _frame_size(audio)
    usable = len(audio.samples) // frame * frame
    if usable == 0:
        return np.empty(0)
    rms = np.sqrt(np.mean(np.square(audio.samples[:usable].reshape(-1, frame)), axis=1))
    return 20 * np.log10(np.maximum(rms, DIGITAL_SILENCE_AMPLITUDE))


def _speech_span(voiced: np.ndarray) -> np.ndarray:
    """첫 말소리부터 마지막 말소리까지. 녹음 버튼 앞뒤의 무음은 멈춤이 아니다."""
    on = np.flatnonzero(voiced)
    if on.size == 0:
        return voiced[:0]
    return voiced[on[0]:on[-1] + 1]


def _frame_size(audio: Audio) -> int:
    return max(1, int(audio.sample_rate * FRAME_SEC))


def _frame_sec(audio: Audio) -> float:
    return _frame_size(audio) / audio.sample_rate
