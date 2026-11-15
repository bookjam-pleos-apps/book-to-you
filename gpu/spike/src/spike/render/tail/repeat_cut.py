"""마지막 문장을 한 번 더 읽힌 생성음에서 반복부 앞의 쉼을 찾아 앞부분만 남긴다. 어댑터(numpy, librosa).

쉼은 두 단계로 고른다.
1. 음절 비율로 예상한 위치 근처에서, 반복부 길이가 그럴듯한 쉼만 후보로 둔다.
2. 그중 쉼 뒤 소리가 쉼 앞 마지막 문장과 가장 닮은(MFCC DTW) 쉼을 고른다.

가장 가까운 쉼이나 가장 긴 쉼을 고르면 틀린다. 앞은 된소리 앞 막힘 무음('기뻐'의 'ㅃ' 앞)에서 말끝을 자르고,
뒤는 대사 안 문장 사이 쉼을 고른다. 길이 조건은 "영차, 영차!"처럼 반복부 안에 같은 말이 또 있을 때를 막는다.
"""
import numpy as np

from spike.sound.audio import Audio
from spike.sound.audio_gaps import FRAME_SEC, Gap, faded_head, frame_db, inner_gaps, voiced_span

SEARCH_SEC = 1.5
TAIL_RATIO = (0.6, 1.6)
MIN_COMPARE_SEC = 0.2


def _candidate_gaps(db: np.ndarray, span: Gap, fraction: float) -> list[Gap]:
    lo, hi = span
    target = lo + fraction * (hi - lo)
    expected_tail = hi - target
    return [
        (start, end) for start, end in inner_gaps(db, span)
        if abs((start + end) / 2 - target) * FRAME_SEC <= SEARCH_SEC
        and TAIL_RATIO[0] <= (hi - end) / expected_tail <= TAIL_RATIO[1]
    ]


def _mfcc(segment: np.ndarray, sample_rate: int) -> np.ndarray:
    import librosa

    features = librosa.feature.mfcc(y=segment.astype(np.float32), sr=sample_rate, n_mfcc=20)[1:]
    return features - features.mean(axis=1, keepdims=True)


def _repeat_cost(samples: np.ndarray, sample_rate: int, gap: Gap, last_voiced: int) -> float:
    """쉼 뒤 반복부와, 쉼 앞의 같은 길이 소리 사이의 DTW 거리. 같은 문장을 두 번 읽었으니 진짜 경계에서 가장 작다."""
    import librosa

    frame = int(sample_rate * FRAME_SEC)
    tail = samples[gap[1] * frame:(last_voiced + 1) * frame]
    before = samples[max(0, gap[0] * frame - len(tail)):gap[0] * frame]
    if min(len(tail), len(before)) < sample_rate * MIN_COMPARE_SEC:
        return float("inf")
    cost, path = librosa.sequence.dtw(X=_mfcc(before, sample_rate), Y=_mfcc(tail, sample_rate), metric="cosine")
    return float(cost[-1, -1] / len(path))


def cut_repeat(audio: Audio, fraction: float) -> Audio | None:
    db = frame_db(audio.samples, audio.sample_rate)
    span = voiced_span(db)
    gaps = [] if span is None else _candidate_gaps(db, span, fraction)
    if span is None or not gaps:
        return None
    best = min(gaps, key=lambda gap: _repeat_cost(audio.samples, audio.sample_rate, gap, span[1]))
    return faded_head(audio, best)

