"""생성음에서 말소리 사이 쉼을 찾고, 쉼에서 앞부분만 잘라 낸다. 꼬리 자르기(repeat_cut, word_cut)가 같이 쓴다. 어댑터(numpy)."""
import numpy as np

from spike.sound.audio import Audio

FRAME_SEC = 0.01
SILENT_DB = -40.0
MIN_GAP_SEC = 0.08
KEEP_INTO_GAP_SEC = 0.15
FADE_SEC = 0.02

Gap = tuple[int, int]


def frame_db(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    size = int(sample_rate * FRAME_SEC)
    frames = samples[: len(samples) // size * size].reshape(-1, size)
    rms = np.sqrt((frames.astype(np.float64) ** 2).mean(axis=1)) + 1e-9
    return 20 * np.log10(rms / rms.max())


def silent_runs(silent: np.ndarray) -> list[Gap]:
    edges = np.flatnonzero(np.diff(np.concatenate([[0], silent.astype(int), [0]])))
    return [(int(start), int(end)) for start, end in zip(edges[::2], edges[1::2])]


def voiced_span(db: np.ndarray) -> Gap | None:
    """첫 말소리 프레임과 마지막 말소리 프레임. 말소리가 없으면 None이다."""
    voiced = np.flatnonzero(db > SILENT_DB)
    return None if len(voiced) == 0 else (int(voiced[0]), int(voiced[-1]))


def inner_gaps(db: np.ndarray, span: Gap, min_gap_sec: float = MIN_GAP_SEC) -> list[Gap]:
    """말소리 구간 안에 있는, min_gap_sec보다 긴 쉼. 기본값은 짧은 막힘을 거르는 길이다."""
    lo, hi = span
    return [
        (start, end) for start, end in silent_runs(db <= SILENT_DB)
        if lo < start and end < hi and (end - start) * FRAME_SEC >= min_gap_sec
    ]


def faded_head(audio: Audio, gap: Gap) -> Audio:
    """쉼 안으로 조금 들어가 자르고 끝을 짧게 줄여 딸깍 소리를 막는다."""
    keep_sec = min(KEEP_INTO_GAP_SEC, (gap[1] - gap[0]) * FRAME_SEC / 2)
    head = np.array(audio.samples[: int((gap[0] * FRAME_SEC + keep_sec) * audio.sample_rate)], dtype=np.float32)
    fade = int(FADE_SEC * audio.sample_rate)
    head[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)
    return Audio(head, audio.sample_rate)
